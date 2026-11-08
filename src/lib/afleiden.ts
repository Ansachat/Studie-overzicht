import type { Dsw, Toets } from "./schema";

const KLEUREN = ["#7C3AED", "#2563EB", "#16A34A", "#EA580C", "#DB2777", "#0891B2", "#CA8A04", "#DC2626", "#0D9488", "#9333EA"];

// Elk vak een eigen kleur. Eerst 10 handgekozen kleuren, daarna verspreid over de kleurencirkel.
export function vakKleur(dsw: Dsw, naam: string) {
  const i = Math.max(0, dsw.vakken.findIndex((v) => v.naam === naam));
  if (i < KLEUREN.length) return KLEUREN[i];
  return `hsl(${Math.round((i * 137.5) % 360)} 62% 45%)`;
}

export function dagenTot(datum: string | null, nu = new Date()): number | null {
  if (!datum) return null;
  const d = new Date(datum + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return Math.round((d.getTime() - vandaag.getTime()) / 86_400_000);
}

export function datumLang(datum: string | null) {
  if (!datum) return "datum nog onbekend";
  return new Date(datum + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

export function datumKort(datum: string | null) {
  if (!datum) return "datum onbekend";
  return new Date(datum + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export function overLabel(d: number) {
  return d === 0 ? "vandaag" : d === 1 ? "morgen" : `over ${d} d`;
}

export type ToetsItem = Toets & { vak: string; kleur: string; dagen: number; id: string };

export function toetsId(vak: string, t: Toets) {
  return `${vak}|${t.titel}|${t.datum ?? ""}`;
}

export type Instellingen = { uitgezet: string[]; groepen?: Record<string, string> };

// Hoort dit item bij de groep die de leerling voor dit vak koos? (geen keuze = alles tonen)
function inMijnGroep(vak: string, groep: string | null | undefined, inst: Instellingen) {
  const keuze = inst.groepen?.[vak];
  return !groep || !keuze || keuze === groep;
}

export function groepenVan(dsw: Dsw, vak: string): string[] {
  const v = dsw.vakken.find((x) => x.naam === vak);
  if (!v) return [];
  const g = new Set<string>(v.groepen ?? []);
  for (const t of v.toetsen) if (t.groep) g.add(t.groep);
  for (const o of v.opdrachten) if (o.groep) g.add(o.groep);
  return [...g].sort();
}

export function komendeToetsen(dsw: Dsw, inst: Instellingen | string[]): ToetsItem[] {
  const i: Instellingen = Array.isArray(inst) ? { uitgezet: inst } : inst;
  return dsw.vakken
    .filter((v) => !i.uitgezet.includes(v.naam))
    .flatMap((v) =>
      v.toetsen
        .filter((t) => inMijnGroep(v.naam, t.groep, i))
        .map((t) => ({ ...t, vak: v.naam, kleur: vakKleur(dsw, v.naam), dagen: dagenTot(t.datum), id: toetsId(v.naam, t) })),
    )
    .filter((t): t is ToetsItem => t.dagen !== null && t.dagen >= 0)
    .sort((a, b) => a.dagen - b.dagen);
}

// Alles wat eraan komt: toetsen én taken (huiswerk, opdrachten, deadlines, …).
export type Item = {
  id: string;
  soort: "toets" | "taak";
  type: string;
  titel: string;
  datum: string;
  dagen: number;
  vak: string;
  kleur: string;
  groep: string | null;
  weging: string | null;
  stof: string | null;
  waar: string | null;
  taken: string[];
  omschrijving: string | null;
};

export function komendeItems(dsw: Dsw, inst: Instellingen): Item[] {
  const toetsen: Item[] = komendeToetsen(dsw, inst).map((t) => ({
    id: t.id,
    soort: "toets",
    type: t.type,
    titel: t.titel,
    datum: t.datum!,
    dagen: t.dagen,
    vak: t.vak,
    kleur: t.kleur,
    groep: t.groep ?? null,
    weging: t.weging,
    stof: t.stof,
    waar: t.waar,
    taken: t.taken,
    omschrijving: null,
  }));
  const taken: Item[] = dsw.vakken
    .filter((v) => !inst.uitgezet.includes(v.naam))
    .flatMap((v) =>
      v.opdrachten
        .filter((o) => inMijnGroep(v.naam, o.groep, inst))
        .map((o) => ({ o, dagen: dagenTot(o.deadline), vak: v.naam }))
        .filter((x) => x.dagen !== null && x.dagen >= 0)
        .map(({ o, dagen, vak }) => ({
          id: `${vak}|${o.titel}|${o.deadline}`,
          soort: "taak" as const,
          type: o.type ?? "Taak",
          titel: o.titel,
          datum: o.deadline!,
          dagen: dagen!,
          vak,
          kleur: vakKleur(dsw, vak),
          groep: o.groep ?? null,
          weging: o.weging ?? null,
          stof: null,
          waar: null,
          taken: [],
          omschrijving: o.omschrijving,
        })),
    );
  // Bij gelijke dag: toetsen eerst.
  return [...toetsen, ...taken].sort((a, b) => a.dagen - b.dagen || (a.soort === b.soort ? 0 : a.soort === "toets" ? -1 : 1));
}

// Simpele "wat is er veranderd" vergelijking tussen twee DSW-versies.
export function wijzigingen(oud: Dsw | undefined, nieuw: Dsw): string[] {
  if (!oud) return [];
  const uit: string[] = [];
  for (const v of nieuw.vakken) {
    const ov = oud.vakken.find((x) => x.naam === v.naam);
    if (!ov) continue;
    for (const t of v.toetsen) {
      const ot = ov.toetsen.find((x) => x.titel === t.titel);
      if (!ot) uit.push(`${v.naam}: nieuwe toets "${t.titel}"`);
      else {
        if (ot.datum !== t.datum) uit.push(`${v.naam}: "${t.titel}" verplaatst naar ${datumKort(t.datum)}`);
        if (ot.stof !== t.stof) uit.push(`${v.naam}: stof van "${t.titel}" is aangepast`);
      }
    }
  }
  return uit;
}
