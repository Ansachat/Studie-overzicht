import { z } from "zod";

export const BlokSchema = z.object({
  datum: z.string().describe("YYYY-MM-DD"),
  start: z.string().describe("HH:MM, 24-uurs"),
  eind: z.string().describe("HH:MM, 24-uurs"),
  vak: z.string().describe("Exact de vaknaam uit de toetslijst"),
  taak: z.string().describe("Concrete taak, bijv. 'Opgaven §6.3 en §6.4 maken'"),
  methode: z.string().describe("Hoe je dit het best leert, in één zin, bijv. 'Actief oefenen: eerst zelf, dan nakijken'"),
});

export const PlanSchema = z.object({
  antwoord: z.string().describe("Kort, vriendelijk antwoord aan de leerling over het plan of de aanpassing (max 3 zinnen)"),
  blokken: z.array(BlokSchema),
  tips: z.array(z.string()).describe("3 tot 5 leertips die specifiek bij deze toetsen passen"),
});

export type Blok = z.infer<typeof BlokSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export type ChatBericht = { rol: "leerling" | "planner"; tekst: string };

// .ics-bestand maken dat je in Google Agenda (of Apple/Outlook) kunt importeren.
export function naarIcs(blokken: Blok[]): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const dt = (datum: string, tijd: string) => `${datum.replace(/-/g, "")}T${tijd.replace(":", "")}00`;
  const nu = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const events = blokken.map((b, i) =>
    [
      "BEGIN:VEVENT",
      `UID:overzicht-${b.datum}-${b.start}-${i}@studie-overzicht`,
      `DTSTAMP:${nu}`,
      `DTSTART;TZID=Europe/Amsterdam:${dt(b.datum, b.start)}`,
      `DTEND;TZID=Europe/Amsterdam:${dt(b.datum, b.eind)}`,
      `SUMMARY:${esc(`${b.vak}: ${b.taak}`)}`,
      `DESCRIPTION:${esc(b.methode)}`,
      "END:VEVENT",
    ].join("\r\n"),
  );
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Overzicht//Planner//NL", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
}

// Link die één blok direct in Google Agenda opent.
export function googleAgendaLink(b: Blok): string {
  const dt = (datum: string, tijd: string) => `${datum.replace(/-/g, "")}T${tijd.replace(":", "")}00`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.vak}: ${b.taak}`,
    dates: `${dt(b.datum, b.start)}/${dt(b.datum, b.eind)}`,
    details: b.methode,
    ctz: "Europe/Amsterdam",
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}
