import type { Dsw, Toets } from "./schema";

const KLEUREN = ["#7C3AED", "#2563EB", "#16A34A", "#0891B2", "#0D9488", "#EA580C", "#DB2777", "#CA8A04", "#4F46E5", "#DC2626"];

// Elk vak een eigen kleur, op volgorde in de DSW, zodat er geen dubbele zijn.
export function vakKleur(dsw: Dsw, naam: string) {
  const i = Math.max(0, dsw.vakken.findIndex((v) => v.naam === naam));
  return KLEUREN[i % KLEUREN.length];
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

export function komendeToetsen(dsw: Dsw, uitgezet: string[]): ToetsItem[] {
  return dsw.vakken
    .filter((v) => !uitgezet.includes(v.naam))
    .flatMap((v) =>
      v.toetsen.map((t) => ({ ...t, vak: v.naam, kleur: vakKleur(dsw, v.naam), dagen: dagenTot(t.datum), id: toetsId(v.naam, t) })),
    )
    .filter((t): t is ToetsItem => t.dagen !== null && t.dagen >= 0)
    .sort((a, b) => a.dagen - b.dagen);
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
