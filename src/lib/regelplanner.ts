import type { Blok, Plan } from "./plan";
import type { ToetsItem } from "./afleiden";

// Planner zonder AI. Plant altijd één week tegelijk (maandag t/m zondag).
// - Elke toets krijgt een totale leertijd (zwaardere toets = meer tijd).
// - Die tijd wordt verdeeld over de weken tot de toets: deze week alleen jouw deel.
// - Wat je al gedaan hebt (afgevinkte blokken) telt mee en wordt niet opnieuw gepland.
// - Blokken van max 45 min, max 3 toetsblokken per dag, vakken afwisselen, herhalen op de dag vóór de toets.

export type Moment = { dag: number; start: string; eind: string }; // dag: 0 = zondag … 6 = zaterdag

/** Iets wat je deze week af wilt hebben. dag = uiterlijk op deze weekdag (0 = zondag), null = deze week.
 *  toets = id van een toets: dan is dit "zoveel wil ik deze week voor die toets leren". */
export type Weekdoel = { id: string; titel: string; vak: string | null; minuten: number; dag: number | null; klaar?: boolean; toets?: string; week?: string };

export type PlanBlok = Blok & { id?: string; doel?: string; minuten?: number; gedaan?: boolean };
export type WeekPlan = Omit<Plan, "blokken"> & { blokken: PlanBlok[]; week?: string };

/** Logboek van gedane blokken: zo weet de planner hoeveel je per toets/taak al hebt gedaan. */
export type Gedaan = { id: string; doel: string; minuten: number; datum: string };

const BLOK_MIN = 45;
const PAUZE_MIN = 10;
const MAX_PER_DAG = 3;

export const METHODE = {
  overzicht: "Eerst overzicht: lees de stof en maak een korte samenvatting of mindmap",
  oefenen: "Actief oefenen: maak opgaven zonder je boek, kijk daarna na",
  overhoren: "Overhoor jezelf: leg de stof hardop uit of gebruik flashcards",
  herhalen: "Herhalen: alleen je fouten en lastige stukken, geen nieuwe stof",
  eigen: "Eén ding tegelijk: telefoon weg, timer aan, en pas stoppen als het blok om is",
};

/** Hoeveel minuten je in totaal voor een toets zou moeten leren. */
export function leertijd(t: Pick<ToetsItem, "type" | "weging">): number {
  const basis: Record<string, number> = {
    SO: 90,
    "Kijk- en luistertoets": 90,
    Mondeling: 120,
    Toets: 150,
    Proefwerk: 180,
    Schoolexamen: 270,
    "PTA-toets": 270,
  };
  let m = basis[t.type] ?? 150;
  const w = parseFloat((t.weging ?? "").replace(",", "."));
  if (!isNaN(w) && (t.weging ?? "").includes("%")) {
    if (w >= 25) m *= 1.35;
    else if (w >= 20) m *= 1.15;
    else if (w <= 10) m *= 0.8;
  }
  return Math.round(m / 15) * 15;
}

export const maandagVan = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

export const isoDag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function gedaanVoor(log: Gedaan[], doel: string, voor?: string) {
  return log.filter((g) => g.doel === doel && (!voor || g.datum < voor)).reduce((s, g) => s + g.minuten, 0);
}

type Invoer = {
  toetsen: ToetsItem[];
  momenten: Moment[];
  afgevinkt: string[];
  weekdoelen: Weekdoel[];
  log: Gedaan[];
  week: string; // maandag van de week, YYYY-MM-DD
  vorigPlan?: WeekPlan | null;
  nu?: Date;
};

export function maakPlan({ toetsen, momenten, afgevinkt, weekdoelen, log, week, vorigPlan, nu = new Date() }: Invoer): WeekPlan {
  const maandag = new Date(week + "T00:00:00");
  const zondag = plusDagen(maandag, 6);
  const vandaag = startVanDag(nu);
  const eerste = vandaag > maandag ? vandaag : maandag;
  const dagen: Date[] = [];
  for (let d = eerste; d <= zondag; d = plusDagen(d, 1)) dagen.push(d);

  const blokken: PlanBlok[] = [];
  const gebruikt = new Map<string, PlanBlok[]>();
  const vrij = new Map<string, { start: number; eind: number }[]>();

  const slotsOp = (d: Date) => {
    const key = isoDag(d);
    if (!vrij.has(key)) {
      vrij.set(
        key,
        momenten
          .filter((m) => m.dag === d.getDay())
          .map((m) => ({ start: minuten(m.start), eind: minuten(m.eind) }))
          .map((s) => (key === isoDag(vandaag) ? { ...s, start: Math.max(s.start, nu.getHours() * 60 + nu.getMinutes() + 5) } : s))
          .filter((s) => s.eind > s.start)
          .sort((a, b) => a.start - b.start),
      );
    }
    return vrij.get(key)!;
  };
  const vrijeMinuten = (d: Date) => slotsOp(d).reduce((som, s) => som + Math.max(0, s.eind - s.start), 0);

  const plaats = (d: Date, slot: { start: number; eind: number }, duur: number, blok: Omit<PlanBlok, "datum" | "start" | "eind" | "minuten">) => {
    const key = isoDag(d);
    const b: PlanBlok = { ...blok, datum: key, start: tijd(slot.start), eind: tijd(slot.start + duur), minuten: duur };
    slot.start += duur + PAUZE_MIN;
    gebruikt.set(key, [...(gebruikt.get(key) ?? []), b]);
    blokken.push(b);
  };

  // 0. Blokken die je deze week al gedaan hebt, blijven staan (en hun tijd is bezet).
  for (const b of vorigPlan?.blokken ?? []) {
    if (!b.gedaan || b.datum < isoDag(maandag) || b.datum > isoDag(zondag)) continue;
    blokken.push(b);
    gebruikt.set(b.datum, [...(gebruikt.get(b.datum) ?? []), b]);
    const d = new Date(b.datum + "T00:00:00");
    if (d < eerste) continue;
    const [s, e] = [minuten(b.start), minuten(b.eind)];
    const nieuw: { start: number; eind: number }[] = [];
    for (const sl of slotsOp(d)) {
      if (e <= sl.start || s >= sl.eind) nieuw.push(sl);
      else {
        if (s > sl.start) nieuw.push({ start: sl.start, eind: s });
        if (e + PAUZE_MIN < sl.eind) nieuw.push({ start: e + PAUZE_MIN, eind: sl.eind });
      }
    }
    vrij.set(b.datum, nieuw);
  }

  const nietGelukt: string[] = [];

  // 1. Eigen weekdoelen (geen toets): opgeknipt in blokken, verspreid over de dagen t/m je deadline.
  for (const w of weekdoelen.filter((x) => !x.toets && !x.klaar && x.minuten > 0)) {
    let rest = w.minuten - gedaanVoor(log, w.id);
    const laatste = w.dag === null ? zondag : dagen.find((d) => d.getDay() === w.dag) ?? zondag;
    const toegestaan = dagen.filter((d) => d <= laatste);
    while (rest > 0) {
      const duur = rest < BLOK_MIN + 15 ? rest : BLOK_MIN;
      const keuze = toegestaan
        .map((d) => ({ d, slot: slotsOp(d).find((s) => s.eind - s.start >= duur), al: (gebruikt.get(isoDag(d)) ?? []).filter((b) => b.doel === w.id).length, vrij: vrijeMinuten(d) }))
        .filter((x) => x.slot)
        .sort((a, b) => a.al - b.al || b.vrij - a.vrij || a.d.getTime() - b.d.getTime())[0];
      if (!keuze?.slot) {
        nietGelukt.push(w.titel);
        break;
      }
      plaats(keuze.d, keuze.slot, duur, { vak: w.vak ?? "Eigen taak", taak: w.titel, methode: METHODE.eigen, doel: w.id, id: maakId() });
      rest -= duur;
    }
  }

  // 2. Toetsen: per toets het deel van de leertijd dat bij deze week hoort.
  const weekStart = isoDag(maandag);
  const volgorde = toetsen.filter((t) => t.datum && t.datum > isoDag(eerste)).sort((a, b) => (a.datum! < b.datum! ? -1 : 1));

  for (const t of volgorde) {
    const totaal = leertijd(t);
    const eerder = gedaanVoor(log, t.id, weekStart);
    const dezeWeek = log.filter((g) => g.doel === t.id && g.datum >= weekStart).reduce((s, g) => s + g.minuten, 0);
    const toetsDag = new Date(t.datum + "T00:00:00");
    // Aantal weken (incl. deze) waarin je nog voor deze toets kunt leren.
    const wekenTot = Math.max(1, Math.ceil((toetsDag.getTime() - maandag.getTime()) / (7 * 86_400_000)));
    const eigen = weekdoelen.find((w) => w.toets === t.id && !w.klaar);
    let doel = eigen ? eigen.minuten : Math.max(0, totaal - eerder) / wekenTot;
    doel = Math.max(0, Math.round((doel - dezeWeek) / 15) * 15);
    if (!eigen && doel > 0 && doel < 30) doel = 30; // geen piepkleine blokjes
    if (doel <= 0) continue;

    const voorToets = dagen.filter((d) => d < toetsDag);
    if (!voorToets.length) continue;
    const toetsInWeek = toetsDag <= plusDagen(zondag, 1);
    const herhaalDag = toetsInWeek ? voorToets[voorToets.length - 1] : null;
    const aantal = Math.ceil(doel / BLOK_MIN);
    const taken = t.taken.filter((taak) => !afgevinkt.includes(`${t.id}|${taak}`));
    let rest = doel;
    let lukte = true;

    // Volgorde van blokken: eerst de herhaling op de dag vóór de toets vastzetten, dan de rest ervoor.
    const plekken: ("herhalen" | "leren")[] = [];
    if (herhaalDag && aantal > 1) plekken.push("herhalen");
    while (plekken.length < aantal) plekken.push("leren");
    const eerdereBlokken = log.filter((g) => g.doel === t.id).length;
    let geleerd = 0;

    for (let k = 0; k < plekken.length && rest > 0; k++) {
      const duur = Math.min(BLOK_MIN, rest);
      const isHerhaling = plekken[k] === "herhalen";
      const voortgangNa = (eerder + dezeWeek + geleerd) / totaal;
      const fase = isHerhaling ? "herhalen" : voortgangNa < 0.35 ? "overzicht" : voortgangNa < 0.75 ? "oefenen" : "overhoren";
      const n = eerdereBlokken + geleerd / BLOK_MIN;
      const taak = isHerhaling ? "Herhalen" : taken.length ? taken[Math.round(n) % taken.length] : fase === "overzicht" ? "Stof doorlezen" : "Oefenen";
      const kandidaten = isHerhaling ? [herhaalDag!] : voorToets.filter((d) => !herhaalDag || aantal === 1 || d.getTime() !== herhaalDag.getTime() || voorToets.length === 1);

      const zoek = (streng: boolean) =>
        kandidaten
          .map((d) => {
            const op = gebruikt.get(isoDag(d)) ?? [];
            const toetsBlokken = op.filter((b) => b.methode !== METHODE.eigen);
            return { d, slot: slotsOp(d).find((s) => s.eind - s.start >= duur), van: op.filter((b) => b.doel === t.id).length, vol: toetsBlokken.length, zelfdeVak: toetsBlokken.some((b) => b.vak === t.vak), vrij: vrijeMinuten(d) };
          })
          .filter((x) => x.slot && (!streng || (x.vol < MAX_PER_DAG && !x.zelfdeVak)))
          .sort((a, b) => a.van - b.van || a.vol - b.vol || b.vrij - a.vrij || a.d.getTime() - b.d.getTime())[0];
      const keuze = zoek(true) ?? zoek(false);
      if (!keuze?.slot) {
        if (isHerhaling) continue; // geen plek op de laatste dag: gewoon de andere blokken plannen
        lukte = false;
        break;
      }
      plaats(keuze.d, keuze.slot, duur, { vak: t.vak, taak: `${taak} · ${t.titel}`, methode: METHODE[fase], doel: t.id, id: maakId() });
      rest -= duur;
      if (!isHerhaling) geleerd += duur;
    }
    if (!lukte) nietGelukt.push(t.vak);
  }

  // Herhalen hoort als laatste: staat er op dezelfde dag later nog een blok van die toets, dan wisselen.
  for (const h of blokken.filter((b) => b.methode === METHODE.herhalen && !b.gedaan)) {
    const later = blokken.filter((b) => b !== h && b.doel === h.doel && b.datum === h.datum && !b.gedaan && b.start > h.start && b.minuten === h.minuten).sort((a, b) => b.start.localeCompare(a.start))[0];
    if (later) [h.start, h.eind, later.start, later.eind] = [later.start, later.eind, h.start, h.eind];
  }

  // Delen van eigen taken op volgorde van tijd nummeren.
  const perDoel = new Map<string, PlanBlok[]>();
  for (const b of blokken.filter((x) => x.methode === METHODE.eigen && x.doel)) perDoel.set(b.doel!, [...(perDoel.get(b.doel!) ?? []), b]);
  for (const lijst of perDoel.values()) {
    if (lijst.length < 2) continue;
    lijst.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
    lijst.forEach((b, i) => (b.taak = `${b.taak.replace(/ \(deel \d+ van \d+\)$/, "")} (deel ${i + 1} van ${lijst.length})`));
  }

  const nieuw = blokken.filter((b) => !b.gedaan);
  const uniekNiet = [...new Set(nietGelukt)];
  const antwoord = nieuw.length
    ? `Deze week: ${nieuw.length} blokken, samen ${duurTekst(nieuw.reduce((s, b) => s + (b.minuten ?? 45), 0))}.` +
      (uniekNiet.length ? ` Niet alles paste (${uniekNiet.join(", ")}): voeg meer tijd toe.` : "")
    : dagen.length
      ? "Ik kon deze week niets inplannen. Voeg momenten toe waarop je kunt leren."
      : "Deze week is voorbij. Kies volgende week.";

  return {
    week,
    antwoord,
    blokken: blokken.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start)),
    tips: [
      "Vink een blok af als je het gedaan hebt: dan telt het mee in je voortgang en plant de volgende week minder.",
      "Begin met het vak waar je het meest tegenop ziet, dan heb je de meeste energie.",
      "Leg je telefoon in een andere kamer tijdens een leerblok.",
      "Overhoor jezelf in plaats van alleen teruglezen: dat onthoud je veel beter.",
    ],
  };
}

export const duurTekst = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}u${String(m % 60).padStart(2, "0")}` : `${m / 60} uur`);

const maakId = () => Math.random().toString(36).slice(2, 10);
const minuten = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const tijd = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const startVanDag = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDagen = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
