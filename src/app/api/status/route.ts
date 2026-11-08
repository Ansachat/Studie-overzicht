import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Laat de app weten of de AI-functies aan staan (alleen als er een API-key is ingesteld).
export function GET() {
  return NextResponse.json({ ai: !!process.env.ANTHROPIC_API_KEY });
}
