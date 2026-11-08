import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { DswSchema } from "@/lib/schema";
import { excelNaarTekst } from "@/lib/excel";
import { haalCsvOp, haalLinkOp, haalVakTabbladenOp, LinkFout } from "@/lib/link";
import { leesRooster, leesTabbladen, parseCsv } from "@/lib/rooster";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;

const SYSTEM = `Je leest een DSW (digitale studiewijzer / toetsrooster) van een Nederlandse middelbare school uit.
Haal per vak alle toetsen en opdrachten eruit. Wees precies: neem datums, weging, stof en vindplaats letterlijk over waar dat kan.
Verzin niets: staat iets er niet, gebruik dan null. Zet datums om naar YYYY-MM-DD; schooljaar loopt van augustus tot juli.
Bedenk per toets 2 tot 4 korte, concrete voorbereidingstaken die passen bij de stof (bijv. "Samenvatting H3 maken", "Oefentoets H6 doen").
Schrijf alles in het Nederlands, kort en leerlingvriendelijk.

Veel DSW's zijn een raster in Google Sheets of Excel:
- Rijen zijn dagen (met week, dag en datum), kolommen zijn vakken. Een cel hoort bij het vak uit de kolomkop en de datum van die rij.
- Kolomkoppen bevatten vaak een klas of cluster en een docentcode, bijv. "Nederlands 5H2" of "Wiskunde B [SUE]". Neem de klas of cluster op in de vaknaam als er meerdere kolommen voor hetzelfde vak zijn, bijv. "Nederlands (5H2)", zodat de leerling zijn eigen groep kan kiezen. Laat docentcodes tussen [ ] weg.
- Cellen beginnen vaak met een soort: "TAAK" = opdracht/taak (zet in opdrachten met die datum als deadline), "SO" = schriftelijke overhoring, "PW" = proefwerk, "PTA" = PTA-toets (telt mee voor het examendossier). Gebruik dit als type, bijv. "PTA-toets".
- Iets als "H1 WIN af" of "HARD DEADLINE" is een deadline: zet het in opdrachten.
- Een percentage in de cel (bijv. "PTA 25%") is de weging.
- Er kunnen aparte tabbladen per vak zijn met meer uitleg over stof en vindplaats. Koppel die aan de juiste toets.
- BELANGRIJK: alleen wat in de Schoolexamen-tabel (kolom Examentitel/Soort) staat met soort SE, SO, PW of (school)examen is een toets. Al het andere (TAAK, PO, huiswerk, voortgangstoetsen, losse planner-items) zet je bij opdrachten, met de soort als type.
- Algemene dingen zonder vak (vakanties, studiedagen, sportdagen, toetsdagen) zijn geen toetsen: laat ze weg.`;

const aiBeschikbaar = () => !!process.env.ANTHROPIC_API_KEY;

function klaar(dsw: unknown, methode: "rooster" | "ai") {
  return NextResponse.json({ dsw, ingelezenOp: new Date().toISOString(), methode });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const tekst = form.get("tekst");
  const link = form.get("link");
  const vandaag = new Date().toISOString().slice(0, 10);

  const content: Anthropic.ContentBlockParam[] = [];

  if (typeof link === "string" && link.trim()) {
    // 1) Hele sheet als xlsx (alle tabbladen). 2) Reserve: tabblad uit de link als CSV.
    let xlsx: ArrayBuffer | null = null;
    try {
      xlsx = (await haalLinkOp(link)).data;
      const rooster = await leesRooster(xlsx);
      if (rooster) return klaar(rooster, "rooster");
    } catch (err) {
      if (err instanceof LinkFout) return NextResponse.json({ error: err.message }, { status: 422 });
      console.error("[extract] xlsx via link mislukt:", err);
    }
    try {
      const [csv, vakTabs] = await Promise.all([haalCsvOp(link), haalVakTabbladenOp(link)]);
      const rooster = leesTabbladen([
        { naam: "DSW", rijen: parseCsv(csv) },
        ...vakTabs.filter((t) => t.csv !== csv).map((t) => ({ naam: t.naam, rijen: parseCsv(t.csv) })),
      ]);
      if (rooster) return klaar(rooster, "rooster");
      if (!aiBeschikbaar()) {
        return NextResponse.json({ error: "In deze sheet staat geen kolom 'datum', dus zonder AI kan ik hem niet lezen. Staat de link op het juiste tabblad?" }, { status: 422 });
      }
      const tekstUitSheet = xlsx ? await excelNaarTekst(xlsx).catch(() => csv) : csv;
      content.push({ type: "text", text: `<dsw bron="google-sheets">\n${tekstUitSheet}\n</dsw>` });
    } catch (err) {
      console.error("[extract] csv via link mislukt:", err);
      const bericht = err instanceof LinkFout ? err.message : `Kon de DSW via deze link niet ophalen (${err instanceof Error ? err.message : "onbekende fout"}).`;
      return NextResponse.json({ error: bericht }, { status: 422 });
    }
  } else if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Bestand is groter dan 20 MB." }, { status: 413 });
    }
    const buf = await file.arrayBuffer();
    const data = Buffer.from(buf).toString("base64");
    const isExcel = file.name.toLowerCase().endsWith(".xlsx") || file.type.includes("spreadsheetml");
    if (isExcel) {
      let tekstUitExcel: string;
      try {
        const rooster = await leesRooster(buf);
        if (rooster) return klaar(rooster, "rooster");
        if (!aiBeschikbaar()) {
          return NextResponse.json({ error: "Dit Excel-bestand heeft geen kolom 'datum', dus zonder AI kan ik het niet lezen." }, { status: 422 });
        }
        tekstUitExcel = await excelNaarTekst(buf);
      } catch {
        return NextResponse.json({ error: "Dit Excel-bestand kon ik niet openen." }, { status: 422 });
      }
      content.push({ type: "text", text: `<dsw bron="excel">\n${tekstUitExcel}\n</dsw>` });
    } else if (file.type === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: file.type as "image/png", data },
      });
    } else {
      return NextResponse.json(
        { error: "Upload een PDF, Excel (.xlsx) of afbeelding, of plak de tekst van je DSW." },
        { status: 415 },
      );
    }
  } else if (typeof tekst === "string" && tekst.trim()) {
    content.push({ type: "text", text: `<dsw>\n${tekst}\n</dsw>` });
  } else {
    return NextResponse.json({ error: "Geen DSW meegestuurd." }, { status: 400 });
  }

  if (!aiBeschikbaar()) {
    return NextResponse.json(
      { error: "PDF's, screenshots en tekst kunnen alleen met AI worden gelezen. Gebruik de link naar je Google Sheet of een Excel-bestand." },
      { status: 501 },
    );
  }
  content.push({ type: "text", text: `Vandaag is ${vandaag}. Lees deze DSW uit.` });
  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(DswSchema) },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "De AI kon deze DSW niet verwerken." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return NextResponse.json({ error: "Uitlezen mislukt, probeer het opnieuw." }, { status: 502 });
    }
    return klaar(response.parsed_output, "ai");
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Even te druk, probeer het zo opnieuw." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI-fout (${err.status ?? "?"})` }, { status: 502 });
    }
    throw err;
  }
}
