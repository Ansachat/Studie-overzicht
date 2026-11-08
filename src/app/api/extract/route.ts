import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { DswSchema } from "@/lib/schema";
import { excelNaarTekst } from "@/lib/excel";
import { haalLinkOp, LinkFout } from "@/lib/link";

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
- Algemene dingen zonder vak (vakanties, studiedagen, sportdagen, toetsdagen) zijn geen toetsen: laat ze weg.`;

export async function POST(req: Request) {
  const client = new Anthropic();
  const form = await req.formData();
  const file = form.get("file");
  const tekst = form.get("tekst");
  const link = form.get("link");
  const vandaag = new Date().toISOString().slice(0, 10);

  const content: Anthropic.ContentBlockParam[] = [];

  if (typeof link === "string" && link.trim()) {
    try {
      const opgehaald = await haalLinkOp(link);
      const tekstUitSheet = await excelNaarTekst(opgehaald.data);
      content.push({ type: "text", text: `<dsw bron="google-sheets">\n${tekstUitSheet}\n</dsw>` });
    } catch (err) {
      const bericht = err instanceof LinkFout ? err.message : "Kon de DSW via deze link niet ophalen.";
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

  content.push({ type: "text", text: `Vandaag is ${vandaag}. Lees deze DSW uit.` });

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
    return NextResponse.json({ dsw: response.parsed_output, ingelezenOp: new Date().toISOString() });
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
