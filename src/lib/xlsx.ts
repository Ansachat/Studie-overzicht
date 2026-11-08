import JSZip from "jszip";

// Minimale, robuuste .xlsx-lezer. Werkt ook met exports van Google Sheets
// (die absolute paden in de relaties gebruiken). Geeft per tabblad een raster van tekst/getallen.
export type RuwTabblad = { naam: string; rijen: (string | number)[][] };

export async function leesXlsx(buf: ArrayBuffer): Promise<RuwTabblad[]> {
  const zip = await JSZip.loadAsync(buf);
  const lees = async (pad: string) => (await zip.file(pad)?.async("string")) ?? null;

  const workbook = await lees("xl/workbook.xml");
  if (!workbook) throw new Error("Geen geldig Excel-bestand (workbook.xml ontbreekt).");
  const rels = (await lees("xl/_rels/workbook.xml.rels")) ?? "";

  const doelen = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) doelen.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }

  const gedeeld: string[] = [];
  const ss = await lees("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) gedeeld.push(tekstUit(m[1]));

  const tabs: RuwTabblad[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const naam = decode(attr(m[1], "name") ?? "Blad");
    const rid = attr(m[1], "r:id");
    const pad = rid ? doelen.get(rid) : undefined;
    const xml = pad ? await lees(pad) : null;
    if (!xml) continue;
    tabs.push({ naam, rijen: leesBlad(xml, gedeeld) });
  }
  return tabs;
}

function leesBlad(xml: string, gedeeld: string[]): (string | number)[][] {
  const rijen: (string | number)[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(attr(rm[1], "r") ?? rijen.length + 1) - 1;
    const rij: (string | number)[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], "r");
      const kol = ref ? kolomIndex(ref) : rij.length;
      const t = attr(cm[1], "t");
      const inhoud = cm[2] ?? "";
      const v = inhoud.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let waarde: string | number = "";
      if (t === "s" && v !== undefined) waarde = gedeeld[Number(v)] ?? "";
      else if (t === "inlineStr") waarde = tekstUit(inhoud);
      else if (t === "str" || t === "e") waarde = decode(v ?? "");
      else if (t === "b") waarde = v === "1" ? "WAAR" : "ONWAAR";
      else if (v !== undefined) waarde = Number.isFinite(Number(v)) ? Number(v) : decode(v);
      rij[kol] = waarde;
    }
    for (let i = 0; i < rij.length; i++) if (rij[i] === undefined) rij[i] = "";
    rijen[r] = rij;
  }
  for (let i = 0; i < rijen.length; i++) if (!rijen[i]) rijen[i] = [];
  return rijen;
}

function kolomIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function tekstUit(xml: string) {
  // Alleen <t>-tekst, geen fonetische hulptekst (<rPh>).
  const zonderRph = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  return decode([...zonderRph.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
}

function attr(s: string, naam: string) {
  const m = s.match(new RegExp(`(?:^|\\s)${naam.replace(":", "\\:")}="([^"]*)"`));
  return m ? m[1] : null;
}

function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}
