import ExcelJS from "exceljs";

// Zet een Excel-DSW om naar compacte tekst voor de AI.
// DSW's zijn vaak rasters (rijen = dagen, kolommen = vakken) met veel lege cellen.
// Daarom zoeken we per tabblad de kopregel en schrijven we per rij alleen de gevulde
// cellen op als "kolomkop: waarde". Dat scheelt veel tokens en de AI ziet direct bij welk vak iets hoort.
export async function excelNaarTekst(buf: ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const delen: string[] = [];

  wb.eachSheet((ws) => {
    const rijen: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      rijen.push((row.values as unknown[]).slice(1).map((v) => celTekst(v)));
    });
    if (!rijen.length) return;

    // Kopregel = eerste rij met minstens 4 gevulde cellen.
    const kopIndex = rijen.findIndex((r) => r.filter(Boolean).length >= 4);
    const kop = kopIndex >= 0 ? rijen[kopIndex] : [];
    const regels: string[] = [];
    rijen.forEach((r, i) => {
      if (i === kopIndex) return;
      const cellen = r
        .map((waarde, k) => (waarde ? (kop[k] && i > kopIndex ? `${kop[k]}: ${waarde}` : waarde) : ""))
        .filter(Boolean);
      if (cellen.length) regels.push(cellen.join(" | "));
    });
    const kopTekst = kop.length ? `Kolommen: ${kop.filter(Boolean).join(" | ")}\n` : "";
    delen.push(`## Tabblad: ${ws.name}\n${kopTekst}${regels.join("\n")}`);
  });

  return delen.join("\n\n");
}

function celTekst(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return schoon(o.richText.map((r) => r.text).join(""));
    if (o.text) return schoon(String(o.text));
    if (o.result !== undefined) return celTekst(o.result);
    return "";
  }
  return schoon(String(v));
}

const schoon = (s: string) => s.replace(/\s+/g, " ").trim();
