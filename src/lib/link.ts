// Haalt een DSW op via een gedeelde link. Alleen bekende, veilige hosts (geen willekeurige URL's ophalen).
const MAX_BYTES = 20 * 1024 * 1024;

export type LinkResultaat = { soort: "excel"; data: ArrayBuffer };

export function sheetIdUitLink(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (u.hostname !== "docs.google.com") return null;
    const m = u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function isOndersteundeLink(link: string) {
  return sheetIdUitLink(link) !== null;
}

export async function haalLinkOp(link: string): Promise<LinkResultaat> {
  const id = sheetIdUitLink(link);
  if (!id) throw new LinkFout("Plak een link naar een Google Sheet (docs.google.com/spreadsheets/...).");

  // Export als .xlsx: dan krijgen we alle tabbladen in één keer.
  const res = await haal(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) {
    throw new LinkFout("Deze sheet is niet openbaar. Zet delen op 'Iedereen met de link kan bekijken' of upload het bestand.");
  }
  const lengte = Number(res.headers.get("content-length") ?? 0);
  if (lengte > MAX_BYTES) throw new LinkFout("Deze DSW is groter dan 20 MB.");
  const data = await res.arrayBuffer();
  if (data.byteLength > MAX_BYTES) throw new LinkFout("Deze DSW is groter dan 20 MB.");
  return { soort: "excel", data };
}

// Reserve: één tabblad als CSV (het tabblad uit de link, anders het eerste).
export async function haalCsvOp(link: string): Promise<string> {
  const id = sheetIdUitLink(link);
  if (!id) throw new LinkFout("Plak een link naar een Google Sheet.");
  const gid = link.match(/[#&?]gid=(\d+)/)?.[1];
  const res = await haal(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) throw new LinkFout("Deze sheet is niet openbaar.");
  return res.text();
}

function haal(url: string) {
  return fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StudieOverzicht/1.0)" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
}

export class LinkFout extends Error {}
