import ExcelJS from "exceljs";

// Zet een Excel-DSW om naar leesbare tekst (één blok per tabblad, cellen gescheiden door " | ").
export async function excelNaarTekst(buf: ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const delen: string[] = [];
  wb.eachSheet((ws) => {
    const rijen: string[] = [];
    ws.eachRow((row) => {
      const cellen = (row.values as unknown[]).slice(1).map((v) => celTekst(v));
      if (cellen.some((c) => c)) rijen.push(cellen.join(" | "));
    });
    if (rijen.length) delen.push(`## Tabblad: ${ws.name}\n${rijen.join("\n")}`);
  });
  return delen.join("\n\n");
}

function celTekst(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text) return o.text;
    if (o.result !== undefined) return celTekst(o.result);
    return "";
  }
  return String(v).replace(/\s+/g, " ").trim();
}
