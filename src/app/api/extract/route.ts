import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { DswSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;


const SYSTEM = `Je leest een DSW (digitale studiewijzer / toetsrooster) van een Nederlandse middelbare school uit.
Haal per vak alle toetsen en opdrachten eruit. Wees precies: neem datums, weging, stof en vindplaats letterlijk over waar dat kan.
Verzin niets: staat iets er niet, gebruik dan null. Zet datums om naar YYYY-MM-DD; schooljaar loopt van augustus tot juli.
Bedenk per toets 2 tot 4 korte, concrete voorbereidingstaken die passen bij de stof (bijv. "Samenvatting H3 maken", "Oefentoets H6 doen").
Schrijf alles in het Nederlands, kort en leerlingvriendelijk.`;

export async function POST(req: Request) {
  const client = new Anthropic();
  const form = await req.formData();
  const file = form.get("file");
  const tekst = form.get("tekst");
  const vandaag = new Date().toISOString().slice(0, 10);

  const content: Anthropic.ContentBlockParam[] = [];

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Bestand is groter dan 20 MB." }, { status: 413 });
    }
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    if (file.type === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: file.type as "image/png", data },
      });
    } else {
      return NextResponse.json(
        { error: "Upload een PDF of afbeelding, of plak de tekst van je DSW." },
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
      max_tokens: 16000,
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
