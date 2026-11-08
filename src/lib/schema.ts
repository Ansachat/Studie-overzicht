import { z } from "zod";

// Wat de AI uit een DSW haalt. Alles nullable i.p.v. optional,
// zodat het schema werkt met structured outputs.
export const ToetsSchema = z.object({
  titel: z.string().describe("Korte naam van de toets, bijv. 'Differentiëren'"),
  datum: z
    .string()
    .nullable()
    .describe("Datum als YYYY-MM-DD, of null als er geen exacte datum staat"),
  type: z.string().describe("Bijv. Schriftelijk, Mondeling, Praktische opdracht, SO, PW"),
  weging: z.string().nullable().describe("Hoe zwaar de toets telt, bijv. '20%' of '3x'"),
  stof: z.string().describe("Welke stof je moet kennen, zo concreet mogelijk"),
  waar: z
    .string()
    .nullable()
    .describe("Waar je de stof vindt: boek, hoofdstuk, online omgeving, reader"),
  taken: z
    .array(z.string())
    .describe("2 tot 4 concrete voorbereidingstaken voor een leerling, kort geformuleerd"),
  groep: z.string().nullable().describe("Klas, cluster of docent als de toets maar voor één groep geldt, anders null"),
});

export const OpdrachtSchema = z.object({
  titel: z.string(),
  type: z.string().nullable().describe("Bijv. Taak, Huiswerk, Praktische opdracht, Deadline"),
  deadline: z.string().nullable().describe("YYYY-MM-DD of null"),
  omschrijving: z.string().nullable(),
  weging: z.string().nullable(),
  groep: z.string().nullable(),
});

export const VakSchema = z.object({
  naam: z.string().describe("Vaknaam zoals een leerling hem noemt, bijv. 'Wiskunde B'"),
  toetsen: z.array(ToetsSchema),
  opdrachten: z.array(OpdrachtSchema),
  groepen: z.array(z.string()).describe("Klassen, clusters of docenten als het vak in meerdere groepen is opgesplitst, anders een lege lijst"),
});

export const DswSchema = z.object({
  periode: z.string().nullable().describe("Periode of toetsweek waar de DSW over gaat"),
  vakken: z.array(VakSchema),
});

export type Toets = z.infer<typeof ToetsSchema>;
export type Opdracht = z.infer<typeof OpdrachtSchema>;
export type Vak = z.infer<typeof VakSchema>;
export type Dsw = z.infer<typeof DswSchema>;
