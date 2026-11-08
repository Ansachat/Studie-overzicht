import type { Dsw, Opdracht, Toets } from "./schema";
import { leesXlsx } from "./xlsx";

// Lezer zonder AI voor DSW's in Google Sheets / Excel.
// 1. Planner-tabblad: rijen = dagen (met "datum"), kolommen = vakken. Cellen beginnen met TAAK/SO/PW/PTA/…
// 2. Tabbladen per vak (NE, WB, BI, …): secties "Overzicht lesstof" (Activiteit + Klaar in),
//    "Te gebruiken materiaal", "Voortgangstoetsen" en "Schoolexamen" (Examentitel, Soort, %, Weeknummer).
// Weken worden omgerekend naar de maandag van die week, met de weeknummers uit de planner zelf.

export type Cel = string | number | Date | null | undefined | { [k: string]: unknown };
export type Tabblad = { naam: string; rijen: Cel[][] };

// ---------- vaknamen ----------

const VAKKEN: [RegExp, string][] = [
  [/^(nederlands|ne|ned)$/i, "Nederlands"],
  [/^(engels|en|eng)$/i, "Engels"],
  [/^(frans|fa)$/i, "Frans"],
  [/^(duits|du)$/i, "Duits"],
  [/^(spaans|sp)$/i, "Spaans"],
  [/^(wiskunde a|wa|wisa)$/i, "Wiskunde A"],
  [/^(wiskunde b|wb|wisb)$/i, "Wiskunde B"],
  [/^(wiskunde c|wc)$/i, "Wiskunde C"],
  [/^(wiskunde d|wd)$/i, "Wiskunde D"],
  [/^(natuurkunde|na|nat)$/i, "Natuurkunde"],
  [/^(scheikunde|sk|sch)$/i, "Scheikunde"],
  [/^(biologie|bi|bio)$/i, "Biologie"],
  [/^(aardrijkskunde|ak)$/i, "Aardrijkskunde"],
  [/^(geschiedenis|gs|ges)$/i, "Geschiedenis"],
  [/^(economie|ec|eco)$/i, "Economie"],
  [/^(bedrijfseconomie|be|beco|m&o)$/i, "Bedrijfseconomie"],
  [/^(maatschappijwetenschappen|maw)$/i, "Maatschappijwetenschappen"],
  [/^(maatschappijleer|ma|mal)$/i, "Maatschappijleer"],
  [/^(muziekplus)$/i, "Muziekplus"],
  [/^(muziek|mu)$/i, "Muziek"],
  [/^(kua|kunst|kunst algemeen)$/i, "Kunst"],
  [/^(nlt)$/i, "NLT"],
  [/^(lo|gym|lichamelijke opvoeding)$/i, "LO"],
  [/^(informatica|in|inf)$/i, "Informatica"],
  [/^(filosofie|fi|fil)$/i, "Filosofie"],
  [/^(ckv)$/i, "CKV"],
];
const KOPNAMEN = [
  ...VAKKEN.map(([, n]) => [n, n] as [string, string]),
  ["KUA", "Kunst"] as [string, string],
  ["Nlt", "NLT"] as [string, string],
].sort((a, b) => b[0].length - a[0].length);

function vakUitAfkorting(s: string): string | null {
  const t = s.trim();
  for (const [re, naam] of VAKKEN) if (re.test(t)) return naam;
  return null;
}

// "Nederlands 5H2" → {Nederlands, 5H2}; "Wiskunde B [SUE]" → {Wiskunde B, SUE}; "5H1 VHG" → {null, 5H1 VHG}
export function splitKop(kop: string): { vak: string | null; rest: string } {
  const zonderLegeHaken = kop.replace(/\s+/g, " ").replace(/\[\s*\]/g, "").trim();
  const rest = (s: string) => s.replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
  for (const [kopNaam, naam] of KOPNAMEN) {
    if (zonderLegeHaken.toLowerCase().startsWith(kopNaam.toLowerCase())) {
      return { vak: naam, rest: rest(zonderLegeHaken.slice(kopNaam.length)) };
    }
  }
  if (/^\d[a-z]+\d?\b/i.test(zonderLegeHaken)) return { vak: null, rest: rest(zonderLegeHaken) };
  const naam = zonderLegeHaken.replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, "").trim();
  return { vak: naam || null, rest: "" };
}

// ---------- tekst & datums ----------

export function celTekst(v: Cel): string {
  if (v == null) return "";
  if (v instanceof Date) return isoDatum(v);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return schoon(o.richText.map((r) => r.text).join(""));
    if (o.text != null) return schoon(String(o.text));
    if (o.result !== undefined) return celTekst(o.result as Cel);
    return "";
  }
  return schoon(String(v));
}
const schoon = (s: string) => s.replace(/\s+/g, " ").trim();

function isoDatum(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function serieelNaarDatum(n: number) {
  return isoDatum(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000));
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export type Context = { startJaar: number; weken: Map<number, string> };

export function maakContext(nu = new Date()): Context {
  return { startJaar: nu.getMonth() >= 7 ? nu.getFullYear() : nu.getFullYear() - 1, weken: new Map() };
}

function maandagVan(datum: string) {
  const d = new Date(datum + "T00:00:00Z");
  const dag = d.getUTCDay() || 7;
  return isoDatum(new Date(d.getTime() - (dag - 1) * 86_400_000));
}

function maandagVanWeek(week: number, ctx: Context): string {
  const bekend = ctx.weken.get(week);
  if (bekend) return maandagVan(bekend);
  // Weeknummer niet in de planner? Reken vanaf de dichtstbijzijnde bekende week in hetzelfde kalenderjaar
  // (scholen slaan week 53 soms over, dus ISO klopt dan niet).
  const zelfdeHelft = [...ctx.weken.keys()].filter((w) => w >= 31 === week >= 31);
  if (zelfdeHelft.length) {
    const ref = zelfdeHelft.reduce((x, y) => (Math.abs(y - week) < Math.abs(x - week) ? y : x));
    const m = new Date(maandagVan(ctx.weken.get(ref)!) + "T00:00:00Z");
    return isoDatum(new Date(m.getTime() + (week - ref) * 7 * 86_400_000));
  }
  const jaar = week >= 31 ? ctx.startJaar : ctx.startJaar + 1;
  const vier = new Date(Date.UTC(jaar, 0, 4));
  const dag = vier.getUTCDay() || 7;
  return isoDatum(new Date(vier.getTime() - (dag - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000));
}

export type Moment = { datum: string; precisie: "dag" | "week" };

/** Leest een datum uit een cel. Met `weekMag` worden ook kale weeknummers ("3/4", "46") herkend. */
export function leesMoment(v: Cel, ctx: Context, weekMag = false): Moment | null {
  if (v instanceof Date) return { datum: isoDatum(v), precisie: "dag" };
  if (typeof v === "number") {
    if (v > 30000 && v < 80000) return { datum: serieelNaarDatum(v), precisie: "dag" };
    if (weekMag && v >= 1 && v <= 53 && Number.isInteger(v)) return { datum: maandagVanWeek(v, ctx), precisie: "week" };
    return null;
  }
  const s = celTekst(v).toLowerCase();
  if (!s) return null;
  let m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return { datum: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, precisie: "dag" };
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { datum: `${m[1]}-${m[2]}-${m[3]}`, precisie: "dag" };
  m = s.match(new RegExp(`(\\d{1,2})\\s+(${MAANDEN.join("|")}|${MAANDEN.map((x) => x.slice(0, 3)).join("|")})\\b`));
  if (m) {
    const maand = MAANDEN.findIndex((x) => x.startsWith(m![2].slice(0, 3)));
    const jaar = maand >= 7 ? ctx.startJaar : ctx.startJaar + 1;
    return { datum: `${jaar}-${String(maand + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`, precisie: "dag" };
  }
  m = s.match(/\b(?:week|wk)\.?\s*(\d{1,2})\b/);
  if (m) return { datum: maandagVanWeek(Number(m[1]), ctx), precisie: "week" };
  if (weekMag) {
    m = s.match(/^(\d{1,2})(?:\s*[/+&-]\s*\d{1,2})?$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 53) return { datum: maandagVanWeek(Number(m[1]), ctx), precisie: "week" };
  }
  return null;
}

// ---------- soorten ----------

const HERHALEN = ["Stof doorlezen en samenvatten", "Oefenopgaven of oefentoets maken", "Fouten en moeilijke stukken herhalen", "Laatste herhaling: kernbegrippen overhoren"];
const STANDAARDTAKEN: Record<string, string[]> = {
  "PTA-toets": HERHALEN,
  Schoolexamen: HERHALEN,
  Proefwerk: ["Stof doorlezen en samenvatten", "Oefenopgaven maken", "Laatste herhaling: jezelf overhoren"],
  Toets: ["Stof doorlezen en samenvatten", "Oefenopgaven maken", "Laatste herhaling: jezelf overhoren"],
  SO: ["Stof doorlezen", "Jezelf overhoren"],
  Mondeling: ["Belangrijkste punten op een rijtje zetten", "Hardop oefenen, bijv. met een klasgenoot", "Laatste keer hardop doornemen"],
};

type Soort = { soort: "toets"; type: string } | { soort: "taak"; type: string } | null;

export function soortVan(tekst: string): Soort {
  const t = tekst.toLowerCase();
  if (/\bmondeling|\bluistertoets|kijk- en luister/.test(t)) return { soort: "toets", type: "Mondeling" };
  if (/^\s*po\b|\bpraktische opdracht|\bpraktijkopdracht/.test(t)) return { soort: "taak", type: "Praktische opdracht" };
  if (/\bpta\b/.test(t)) return { soort: "toets", type: "PTA-toets" };
  if (/^\s*se\b|schoolexamen/.test(t)) return { soort: "toets", type: "Schoolexamen" };
  if (/^\s*pw\b|proefwerk/.test(t)) return { soort: "toets", type: "Proefwerk" };
  if (/^\s*so\b|overhoring/.test(t)) return { soort: "toets", type: "SO" };
  if (/^\s*(toets|tt|vt)\b|\btoets\b|schriftelijk|voortgangstoets/.test(t)) return { soort: "toets", type: "Toets" };
  if (/deadline|\baf\s*$|\baf\b(?!\w)/.test(t)) return { soort: "taak", type: "Deadline" };
  if (/^\s*taak\b|\bopdracht\b|\binleveren|\bverslag|\bpresentatie|\bwerkstuk/.test(t)) return { soort: "taak", type: "Taak" };
  return null;
}

// Alleen wat in de Schoolexamen-tabel staat met soort SE, SO, PW of (school)examen telt als toets.
export function seSoort(tekst: string): string | null {
  const t = tekst.toLowerCase();
  if (/\bpw\b|proefwerk/.test(t)) return "PW";
  if (/\bso\b|overhoring/.test(t)) return "SO";
  if (/\bse\b|examen/.test(t)) return "SE";
  return null;
}

const NEGEER = /^(lesvrij|leerlingen vrij|vrij|geen les|vakantie|kerstvakantie|herfstvakantie|voorjaarsvakantie|meivakantie|studiedag|uitval|-|x|geen|n\.?v\.?t\.?)$/i;

function zonderPrefix(tekst: string) {
  return tekst.replace(/^\s*(PTA|PW|SO|SE|TAAK|PO|TOETS|MONDELING)\b[\s:.-]*/i, "").trim();
}
function wegingUit(tekst: string): string | null {
  const m = tekst.match(/\b(\d{1,3}(?:[.,]\d)?)\s?%/);
  return m ? `${m[1]}%` : null;
}
function kort(s: string, max = 70) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// ---------- verzamelen ----------

type InterneToets = Toets & { precisie: "dag" | "week"; bron: "planner" | "vak" };
type Interne = { toetsen: InterneToets[]; opdrachten: Opdracht[]; waar: string | null; groepen: string[] };

class Verzameling {
  vakken = new Map<string, Interne>();
  vak(naam: string) {
    if (!this.vakken.has(naam)) this.vakken.set(naam, { toetsen: [], opdrachten: [], waar: null, groepen: [] });
    return this.vakken.get(naam)!;
  }
}

export async function leesRooster(buf: ArrayBuffer): Promise<Dsw | null> {
  return leesTabbladen(await leesXlsx(buf));
}

export function leesTabbladen(tabs: Tabblad[], nu = new Date()): Dsw | null {
  const ctx = maakContext(nu);
  const v = new Verzameling();
  let periode: string | null = null;

  // Eerst planners (die leveren ook de weeknummers), daarna de tabbladen per vak.
  const planners = tabs.filter((t) => !vakUitAfkorting(t.naam) && vindPlannerKop(t.rijen, ctx));
  for (const t of planners) if (leesPlanner(t, ctx, v)) periode ??= t.naam;
  for (const t of tabs) {
    if (planners.includes(t)) continue;
    const vak = vakUitAfkorting(t.naam) ?? (/mentor|lob/i.test(t.naam) ? "Mentoraat / LOB" : null);
    if (vak) leesVakTab(t, vak, ctx, v);
  }

  if (v.vakken.size === 0) return null;
  return { periode, vakken: samenvoegen(v) };
}

function vindKop(rijen: Cel[][], test: (c: string) => boolean) {
  return rijen.findIndex((r) => r?.some((c) => test(celTekst(c))));
}

// ---------- planner-raster ----------

// Kopregel + datumkolom van een planner. Eerst een kolom met kop "datum"; anders de kolom met de meeste datums
// (de kop staat dan in de regel boven de eerste datum).
function vindPlannerKop(rijen: Cel[][], ctx: Context): { kopIndex: number; datumKol: number } | null {
  const kopIndex = vindKop(rijen, (c) => c.toLowerCase() === "datum");
  if (kopIndex >= 0) return { kopIndex, datumKol: rijen[kopIndex].map(celTekst).findIndex((c) => c.toLowerCase() === "datum") };
  const telling = new Map<number, number>();
  let eersteRij = -1;
  rijen.slice(0, 200).forEach((r, i) =>
    (r ?? []).slice(0, 8).forEach((c, k) => {
      const m = leesMoment(c, ctx);
      if (m?.precisie === "dag") {
        telling.set(k, (telling.get(k) ?? 0) + 1);
        if (eersteRij < 0) eersteRij = i;
      }
    }),
  );
  const [datumKol, aantal] = [...telling.entries()].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
  if (aantal < 5 || eersteRij < 1) return null;
  for (let i = eersteRij - 1; i >= 0; i--) if ((rijen[i] ?? []).filter((c) => celTekst(c)).length >= 3) return { kopIndex: i, datumKol };
  return null;
}

function leesPlanner(tab: Tabblad, ctx: Context, v: Verzameling): boolean {
  const rijen = tab.rijen;
  const gevonden = vindPlannerKop(rijen, ctx);
  if (!gevonden) return false;
  const { kopIndex, datumKol } = gevonden;
  const kop = rijen[kopIndex].map(celTekst);
  let weekKol = kop.findIndex((c) => /^week/i.test(c));
  if (weekKol < 0) weekKol = Math.max(0, datumKol - 2);

  const kolommen = kop.map((k, i) => ({ i, ...splitKop(k) })).filter((k) => k.i > datumKol && (k.vak || k.rest));
  // Kolommen zonder vaknaam ("5H1 VHG") krijgen het vak van de eerstvolgende kolom met vaknaam + groep.
  kolommen.forEach((k, idx) => {
    if (k.vak) return;
    const volgende = kolommen.slice(idx + 1, idx + 5).find((x) => x.vak && x.rest);
    if (volgende) k.vak = volgende.vak;
  });
  const bruikbaar = kolommen.filter((k): k is { i: number; vak: string; rest: string } => !!k.vak);
  if (bruikbaar.length < 2) return false;
  const perVak = new Map<string, number>();
  for (const k of bruikbaar) perVak.set(k.vak, (perVak.get(k.vak) ?? 0) + 1);
  for (const k of bruikbaar) {
    const vak = v.vak(k.vak);
    if ((perVak.get(k.vak) ?? 0) > 1 && k.rest && !vak.groepen.includes(k.rest)) vak.groepen.push(k.rest);
  }

  for (let r = kopIndex + 1; r < rijen.length; r++) {
    const rij = rijen[r] ?? [];
    const moment = leesMoment(rij[datumKol], ctx);
    if (!moment) continue;
    if (weekKol >= 0) {
      const w = celTekst(rij[weekKol]).match(/week\s*(\d{1,2})/i);
      if (w && !ctx.weken.has(Number(w[1]))) ctx.weken.set(Number(w[1]), moment.datum);
    }
    for (const k of bruikbaar) {
      const tekst = celTekst(rij[k.i]);
      if (!tekst || NEGEER.test(tekst)) continue;
      const groep = (perVak.get(k.vak) ?? 0) > 1 ? k.rest || null : null;
      voegCelToe(v.vak(k.vak), tekst, moment.datum, groep);
    }
  }
  return true;
}

function voegCelToe(vak: Interne, tekst: string, datum: string, groep: string | null) {
  const soort = soortVan(tekst);
  const rest = zonderPrefix(tekst);
  const weging = wegingUit(rest);
  const zonderWeging = weging ? rest.replace(/\b\d{1,3}(?:[.,]\d)?\s?%/, "").trim() : rest;
  if (soort?.soort === "toets") {
    vak.toetsen.push({
      titel: kort(zonderWeging || soort.type, 60),
      datum,
      type: soort.type,
      weging,
      stof: zonderWeging || "Zie DSW",
      waar: null,
      taken: STANDAARDTAKEN[soort.type] ?? STANDAARDTAKEN.Toets,
      groep,
      precisie: "dag",
      bron: "planner",
    });
  } else {
    vak.opdrachten.push({
      titel: kort(soort ? zonderWeging || soort.type : tekst),
      type: soort?.type ?? "Overig",
      deadline: datum,
      omschrijving: tekst.length > 70 ? tekst : null,
      weging,
      groep,
    });
  }
}

// ---------- tabblad per vak ----------

const SECTIE = /^(overzicht lesstof|overzicht daltontaken|te gebruiken materiaal|voortgangstoetsen|schoolexamen|examentitel|opmerkingen|stofomschrijving)/i;

function leesVakTab(tab: Tabblad, vakNaam: string, ctx: Context, v: Verzameling) {
  const rijen = tab.rijen.map((r) => (r ?? []).map(celTekst));
  const ruw = tab.rijen;
  const vak = v.vak(vakNaam);
  const eerste = (r: string[]) => r.find((c) => c) ?? "";

  for (let i = 0; i < rijen.length; i++) {
    const rij = rijen[i];
    const eersteCel = eerste(rij);

    // Te gebruiken materiaal → volgende gevulde regel
    if (/^te gebruiken materiaal/i.test(eersteCel)) {
      const volgende = rijen.slice(i + 1, i + 4).map(eerste).find((c) => c && !SECTIE.test(c) && !/^geen$/i.test(c));
      if (volgende) vak.waar = kort(volgende, 90);
      continue;
    }

    // Lesstof/huiswerk: kolommen "Activiteit" en "Klaar in"
    const klaarKol = rij.findIndex((c) => /klaar in$/i.test(c) && c.length < 40);
    const actKol = rij.findIndex((c) => /activiteit$/i.test(c));
    if (klaarKol >= 0 && actKol >= 0) {
      let onderwerp = "";
      for (let j = i + 1; j < rijen.length; j++) {
        const r = rijen[j];
        const e = eerste(r);
        if (SECTIE.test(e) || /activiteit$/i.test(r[actKol] ?? "")) break;
        if (r[0] && actKol !== 0) onderwerp = r[0];
        const act = r[actKol];
        if (!act || NEGEER.test(act)) continue;
        const moment = leesMoment(ruw[j]?.[klaarKol], ctx, true);
        if (!moment) continue;
        const soort = soortVan(act);
        vak.opdrachten.push({ titel: kort(act), type: soort?.type ?? "Huiswerk", deadline: moment.datum, omschrijving: onderwerp || null, weging: null, groep: null });
      }
      continue;
    }

    // Schoolexamen-tabel: kopregel met "Examentitel"
    const titelKol = rij.findIndex((c) => /^examentitel$/i.test(c));
    if (titelKol >= 0) {
      const kol = (re: RegExp) => rij.findIndex((c) => re.test(c));
      const stofKol = kol(/^stofomschrijving/i);
      const soortKol = kol(/^soort/i);
      let wegingKol = kol(/^(%|weging)/i);
      const uurKol = kol(/^(uur|duur|tijd)/i);
      // Geen %-kolom? Dan is een lege kolomkop direct na "Uur" vaak de weging.
      if (wegingKol < 0 && uurKol >= 0 && !rij[uurKol + 1]) wegingKol = uurKol + 1;
      const weekKol = kol(/week|datum|wanneer/i);
      for (let j = i + 1; j < rijen.length; j++) {
        const r = rijen[j];
        const e = eerste(r);
        if (!e) continue;
        if (SECTIE.test(e)) break;
        const titel = r[titelKol] || e;
        const stof = stofKol >= 0 ? r[stofKol] : "";
        const soortTekst = soortKol >= 0 ? r[soortKol] : "";
        let moment = weekKol >= 0 ? leesMoment(ruw[j]?.[weekKol], ctx, true) : null;
        moment ??= zoekMoment(ruw[j] ?? [], ctx, [titelKol, stofKol, wegingKol]);
        let weging = wegingKol >= 0 && /^\d{1,3}([.,]\d)?\s?%?$/.test(r[wegingKol] ?? "") ? normaliseerWeging(r[wegingKol]) : null;
        weging ??= r.map(wegingUit).find(Boolean) ?? null;
        voegExamenToe(vak, titel, stof, soortTekst, weging, moment, true, !r[titelKol]);
        const laatste = vak.toetsen[vak.toetsen.length - 1];
        if (!moment && laatste?.titel === kort(titel, 60) && /toetsweek/i.test(r.join(" ")) && !/toetsweek/i.test(laatste.stof)) laatste.stof += " · toetsweek";
      }
      continue;
    }

    // Voortgangstoetsen: regels tot de volgende sectie
    if (/^voortgangstoetsen/i.test(eersteCel)) {
      for (let j = i + 1; j < rijen.length; j++) {
        const r = rijen[j];
        const e = eerste(r);
        if (!e || /^stofomschrijving/i.test(e)) continue;
        if (SECTIE.test(e)) break;
        if (/^geen\b/i.test(e)) continue;
        const moment = zoekMoment(ruw[j] ?? [], ctx, [r.indexOf(e)]);
        voegExamenToe(vak, e, "", e, r.map(wegingUit).find(Boolean) ?? null, moment, false);
      }
    }
  }
}

function normaliseerWeging(s: string) {
  const n = s.replace("%", "").trim();
  return /^\d{1,3}([.,]\d)?$/.test(n) ? `${n}%` : s;
}

function zoekMoment(rij: Cel[], ctx: Context, overslaan: number[]): Moment | null {
  // Eerst echte datums en "week …", dan kale weekaanduidingen als "3/4" (van rechts naar links).
  for (let k = 0; k < rij.length; k++) {
    if (overslaan.includes(k)) continue;
    if (typeof rij[k] === "number" && (rij[k] as number) < 30000) continue;
    const m = leesMoment(rij[k], ctx, false);
    if (m) return m;
  }
  for (let k = rij.length - 1; k >= 0; k--) {
    if (overslaan.includes(k)) continue;
    const s = celTekst(rij[k]);
    if (/^\d{1,2}\s*\/\s*\d{1,2}$/.test(s)) return leesMoment(s, ctx, true);
  }
  return null;
}

const SE_TYPE: Record<string, string> = { SE: "Schoolexamen", SO: "SO", PW: "Proefwerk" };

// In de Schoolexamen-tabel is alles een toets, behalve praktische opdrachten, handelingsdelen e.d.
const GEEN_TOETS = /\bpo\b|praktisch|praktijk|handelingsdeel|opdracht|verslag|werkstuk|presentatie/i;

function toetsType(soortTekst: string, titel: string, stof: string): string {
  const se = seSoort(soortTekst);
  if (se) return SE_TYPE[se];
  const alles = `${soortTekst} ${titel} ${stof}`.toLowerCase();
  if (/\bpta\b/.test(alles)) return "PTA-toets";
  if (/\bklt\b|luister/.test(alles)) return "Kijk- en luistertoets";
  if (/mondeling/.test(alles)) return "Mondeling";
  return "Schoolexamen";
}

function voegExamenToe(vak: Interne, titel: string, stof: string, soortTekst: string, weging: string | null, moment: Moment | null, uitSE: boolean, zonderTitel = false) {
  if (zonderTitel && !moment && !soortTekst) {
    // Losse opmerking in de tabel ("Let op …"): alleen bewaren als er echt een opdracht staat.
    if (!/maken|inleveren|lezen|leren/i.test(stof || titel)) return;
  }
  const isToets = uitSE && !zonderTitel && !GEEN_TOETS.test(soortTekst || titel);
  if (!isToets) {
    const soort = soortVan(`${soortTekst} ${titel}`);
    vak.opdrachten.push({ titel: kort(stof ? `${titel}: ${stof}` : titel), type: soort?.type ?? (soortTekst ? kort(soortTekst, 30) : "Taak"), deadline: moment?.datum ?? null, omschrijving: null, weging, groep: null });
    return;
  }
  const type = toetsType(soortTekst, titel, stof);
  vak.toetsen.push({
    titel: kort(titel, 60),
    datum: moment?.datum ?? null,
    type,
    weging,
    stof: stof || titel,
    waar: null,
    taken: STANDAARDTAKEN[type] ?? STANDAARDTAKEN.Toets,
    groep: null,
    precisie: moment?.precisie ?? "week",
    bron: "vak",
  });
}

// ---------- samenvoegen ----------

function woorden(s: string) {
  return new Set((s.toLowerCase().match(/[a-z]{2,}\d*|\d+(?:\.\d+)?/g) ?? []).filter((w) => !["de", "het", "en", "pta", "toets", "h", "hoofdstuk", "tm"].includes(w)));
}
function lijktOp(a: string, b: string) {
  const A = woorden(a);
  const B = woorden(b);
  if (!A.size || !B.size) return false;
  let gedeeld = 0;
  for (const w of A) if (B.has(w)) gedeeld++;
  return gedeeld >= Math.min(2, A.size, B.size);
}
function dagenTussen(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function samenvoegen(v: Verzameling): Dsw["vakken"] {
  const uit: Dsw["vakken"] = [];
  for (const [naam, vak] of v.vakken) {
    const planner = vak.toetsen.filter((t) => t.bron === "planner");

    // Dubbele toetsen uit het vak-tabblad samenvoegen (bijv. zowel bij Voortgangstoetsen als Schoolexamen).
    const uniekVak: InterneToets[] = [];
    for (const t of vak.toetsen.filter((x) => x.bron === "vak")) {
      const dubbel = uniekVak.find(
        (u) => lijktOp(`${u.titel} ${u.stof}`, `${t.titel} ${t.stof}`) && (!u.datum || !t.datum || Math.abs(dagenTussen(u.datum, t.datum)) <= 14),
      );
      if (dubbel) {
        dubbel.weging ??= t.weging;
        dubbel.datum ??= t.datum;
        if (t.stof.length > dubbel.stof.length) dubbel.stof = t.stof;
        if (dubbel.type === "Toets" && t.type !== "Toets") dubbel.type = t.type;
      } else uniekVak.push({ ...t });
    }

    // Staat dezelfde toets ook in de planner (met exacte dag)? Dan de extra info daar toevoegen.
    const extra: InterneToets[] = [];
    const gekoppeld = new Set<InterneToets>();
    for (const t of uniekVak) {
      const matches = planner.filter((p) => {
        if (!p.datum || !t.datum) return false;
        const verschil = dagenTussen(t.datum, p.datum);
        const lijkt = lijktOp(p.stof, `${t.stof} ${t.titel}`);
        if (t.precisie === "week") return lijkt ? verschil >= -3 && verschil <= 14 : verschil >= -3 && verschil <= 7;
        return Math.abs(verschil) <= 1;
      });
      if (matches.length) {
        for (const p of matches) {
          gekoppeld.add(p);
          p.type = t.type;
          p.weging ??= t.weging;
          const nietszeggend = /^(toets|pta|se|po|so|pw|schoolexamen)\s*\d*$/i.test(t.titel);
          if (!nietszeggend && (p.titel === p.stof || p.titel.length < 4)) p.titel = t.titel;
          if (t.stof.length > p.stof.length) p.stof = lijktOp(t.stof, p.stof) ? t.stof : `${t.stof} (${p.stof})`;
        }
      } else extra.push(t);
    }

    // Planner-items die niet bij een schoolexamen horen, zijn taken.
    // PTA/SE in de planner is altijd een schoolexamen, ook zonder regel in het vak-tabblad.
    for (const p of planner) if (p.type === "PTA-toets" || p.type === "Schoolexamen") gekoppeld.add(p);
    for (const p of planner) {
      if (gekoppeld.has(p)) continue;
      vak.opdrachten.push({ titel: p.titel, type: p.type, deadline: p.datum, omschrijving: p.stof !== p.titel ? p.stof : null, weging: p.weging, groep: p.groep });
    }
    const toetsen: Toets[] = [...planner.filter((p) => gekoppeld.has(p)), ...extra].map((t) => ({
      titel: t.titel,
      datum: t.datum,
      type: t.type,
      weging: t.weging,
      stof: t.stof,
      waar: t.waar ?? vak.waar,
      taken: t.taken,
      groep: t.groep,
    }));

    const gezien = new Set<string>();
    const opdrachten = vak.opdrachten.filter((o) => {
      const k = `${o.titel.toLowerCase()}|${o.deadline}|${o.groep}`;
      if (gezien.has(k)) return false;
      gezien.add(k);
      return true;
    });

    uit.push({ naam, toetsen, opdrachten, groepen: vak.groepen });
  }
  return uit;
}

// ---------- CSV ----------

export function parseCsv(tekst: string): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [];
  let cel = "";
  let inQuotes = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (inQuotes) {
      if (c === '"' && tekst[i + 1] === '"') {
        cel += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cel += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      rij.push(cel);
      cel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && tekst[i + 1] === "\n") i++;
      rij.push(cel);
      rijen.push(rij);
      rij = [];
      cel = "";
    } else cel += c;
  }
  if (cel || rij.length) {
    rij.push(cel);
    rijen.push(rij);
  }
  return rijen;
}
