import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PlanSchema } from "@/lib/plan";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM = `Je bent een slimme, vriendelijke studieplanner voor een middelbare scholier.
Je krijgt de komende toetsen (met stof, weging en voorbereidingstaken), wat de leerling al heeft afgevinkt, en wanneer de leerling kan.
Maak een realistisch leerschema en houd je strikt aan de tijden waarop de leerling kan.

Plan volgens wat werkt bij leren:
- Spreid de stof over meerdere dagen (gespreid leren), begin eerder met toetsen die zwaar wegen of veel stof hebben.
- Plan herhaling: kort herhalen 1 à 2 dagen voor de toets, geen nieuwe stof op de avond ervoor.
- Blokken van 25 tot 50 minuten, max 2,5 uur per dag, en wissel vakken af binnen een dag.
- Gebruik actieve methodes: oefentoetsen, jezelf overhoren, uitleggen aan een ander, flashcards voor woordjes en begrippen.
- Plan niets op of na het moment van de toets zelf, en niets in het verleden.

Als de leerling een aanpassing vraagt, pas het vorige plan aan in plaats van helemaal opnieuw te beginnen.
Schrijf in het Nederlands, informeel en motiverend, zonder overdreven toon.`;

const Body = z.object({
  vandaag: z.string(),
  toetsen: z.array(z.unknown()).max(80),
  afgevinkt: z.array(z.string()).max(500),
  gesprek: z.array(z.object({ rol: z.enum(["leerling", "planner"]), tekst: z.string().max(2000) })).min(1).max(30),
  vorigPlan: z.unknown().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  const { vandaag, toetsen, afgevinkt, gesprek, vorigPlan } = parsed.data;

  const context = [
    `Vandaag is ${vandaag}.`,
    `<toetsen>\n${JSON.stringify(toetsen, null, 1)}\n</toetsen>`,
    `<al_gedaan>\n${afgevinkt.join("\n") || "(niets)"}\n</al_gedaan>`,
    vorigPlan ? `<vorig_plan>\n${JSON.stringify(vorigPlan)}\n</vorig_plan>` : "",
    `<gesprek>\n${gesprek.map((b) => `${b.rol}: ${b.tekst}`).join("\n")}\n</gesprek>`,
    "Maak of update het leerschema op basis van het laatste bericht van de leerling.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(PlanSchema) },
      messages: [{ role: "user", content: context }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "Plannen lukte niet, probeer het anders te formuleren." }, { status: 422 });
    }
    return NextResponse.json({ plan: response.parsed_output });
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
