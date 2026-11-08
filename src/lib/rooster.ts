import ExcelJS from "exceljs";
import type { Dsw, Opdracht, Toets } from "./schema";

// Lezer zonder AI voor DSW's die een raster zijn: rijen = dagen, kolommen = vakken.
// Cellen beginnen met een soort: TAAK, SO, PW of PTA.

const SOORTEN: Record<string, { type: string; taken: string[] }> = {
  PTA: {
    type: "PTA-toets",
    taken: ["Stof doorlezen en samenvatten", "Oefenopgaven of oefentoets maken", "Fouten en moeilijke stukken herhalen", "Laatste herhaling: kernbegrippen overhoren"],
  },
  PW: {
    type: "Proefwerk",
    taken: ["Stof doorlezen en samenvatten", "Oefenopgaven maken", "Laatste herhaling: jezelf overhoren"],
  },
  SO: {
    type: "SO",
    taken: ["Stof doorlezen", "Jezelf overhoren"],
  },
};

export type Tabblad = { naam: string; rijen: unknown[][] };

export async function leesRooster(buf: ArrayBuffer): Promise<Dsw | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const tabs: Tabblad[] = [];
  wb.eachSheet((ws) => {
    const rijen: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => rijen.push((row.values as unknown[]).slice(1)));
    tabs.push({ naam: ws.name, rijen });
  });
  return leesTabbladen(tabs);
}

export function leesTabbladen(tabs: Tabblad[]): Dsw | null {
  const vakken = new Map<string, { toetsen: Toets[]; opdrachten: Opdracht[] }>();
  let periode: string | null = null;
  let gevonden = false;

  tabs.forEach((ws) => {
    const ruweDatums = ws.rijen;
    const rijen: string[][] = ws.rijen.map((r) => r.map(celTekst));

    const kopIndex = rijen.findIndex((r) => r.some((c) => c.toLowerCase() === "datum"));
    if (kopIndex < 0) return;
    const kop = rijen[kopIndex];
    const datumKol = kop.findIndex((c) => c.toLowerCase() === "datum");
    const vakKolommen = kop
      .map((naam, k) => ({ naam: vakNaam(naam), k }))
      .filter((v) => v.k > datumKol && v.naam);
    if (vakKolommen.length < 2) return;

    gevonden = true;
    periode ??= ws.naam;
    for (const v of vakKolommen) if (!vakken.has(v.naam)) vakken.set(v.naam, { toetsen: [], opdrachten: [] });

    for (let i = kopIndex + 1; i < rijen.length; i++) {
      const datum = leesDatum(ruweDatums[i]?.[datumKol]);
      if (!datum) continue;
      for (const v of vakKolommen) {
        const tekst = rijen[i][v.k] ?? "";
        if (!tekst) continue;
        const vak = vakken.get(v.naam)!;
        const item = leesCel(tekst, datum);
        if (item?.soort === "toets") vak.toetsen.push(item.toets);
        else if (item?.soort === "opdracht") vak.opdrachten.push(item.opdracht);
      }
    }
  });

  if (!gevonden) return null;
  return {
    periode,
    vakken: [...vakken.entries()].map(([naam, v]) => ({ naam, ...v })),
  };
}

type Item = { soort: "toets"; toets: Toets } | { soort: "opdracht"; opdracht: Opdracht } | null;

export function leesCel(tekst: string, datum: string): Item {
  const m = tekst.match(/^\s*(PTA|PW|SO|TAAK)\b[\s:.-]*(.*)$/i);
  if (m) {
    const soort = m[1].toUpperCase();
    let rest = m[2].trim();
    if (soort === "TAAK") return { soort: "opdracht", opdracht: { titel: rest || "Taak", deadline: datum, omschrijving: null } };
    const wegingMatch = rest.match(/\b(\d{1,3}\s?%)/);
    const weging = wegingMatch ? wegingMatch[1].replace(/\s/g, "") : null;
    if (wegingMatch) rest = rest.replace(wegingMatch[0], "").trim();
    const info = SOORTEN[soort];
    return {
      soort: "toets",
      toets: {
        titel: rest ? kort(rest) : info.type,
        datum,
        type: info.type,
        weging,
        stof: rest || "Zie DSW",
        waar: null,
        taken: info.taken,
      },
    };
  }
  // Deadlines zonder soort, bijv. "H1 WIN af" of "HARD DEADLINE LAP"
  if (/\baf\b|deadline|inleveren/i.test(tekst)) {
    return { soort: "opdracht", opdracht: { titel: tekst, deadline: datum, omschrijving: null } };
  }
  return null;
}

function vakNaam(kop: string) {
  return kop.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function kort(s: string) {
  return s.length > 60 ? s.slice(0, 57).trimEnd() + "…" : s;
}

export function leesDatum(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === "object" && "result" in v) return leesDatum((v as { result: unknown }).result);
  const s = celTekst(v);
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function celTekst(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("").replace(/\s+/g, " ").trim();
    if (o.text) return String(o.text).replace(/\s+/g, " ").trim();
    if (o.result !== undefined) return celTekst(o.result);
    return "";
  }
  return String(v).replace(/\s+/g, " ").trim();
}

// Eenvoudige CSV-parser (met aanhalingstekens en regeleindes binnen cellen).
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
