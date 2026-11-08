import { leesXlsx } from "./xlsx";

// Zet een Excel-DSW om naar compacte tekst voor de AI: per rij alleen gevulde cellen als "kolomkop: waarde".
export async function excelNaarTekst(buf: ArrayBuffer): Promise<string> {
  const tabs = await leesXlsx(buf);
  return tabs
    .map((ws) => {
      const rijen = ws.rijen.map((r) => r.map((c) => String(c ?? "").replace(/\s+/g, " ").trim()));
      const kopIndex = rijen.findIndex((r) => r.filter(Boolean).length >= 4);
      const kop = kopIndex >= 0 ? rijen[kopIndex] : [];
      const regels = rijen
        .map((r, i) =>
          i === kopIndex
            ? ""
            : r
                .map((w, k) => (w ? (kop[k] && i > kopIndex ? `${kop[k]}: ${w}` : w) : ""))
                .filter(Boolean)
                .join(" | "),
        )
        .filter(Boolean);
      if (!regels.length) return "";
      return `## Tabblad: ${ws.naam}\n${kop.length ? `Kolommen: ${kop.filter(Boolean).join(" | ")}\n` : ""}${regels.join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
