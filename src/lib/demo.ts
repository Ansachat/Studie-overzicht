import type { Dsw } from "./schema";

// Voorbeelddata om het platform te bekijken zonder eigen DSW.
function over(d: number) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}

export function demoDsw(): Dsw {
  return {
    periode: "Periode 2 (voorbeeld)",
    vakken: [
      { naam: "Wiskunde B", opdrachten: [], toetsen: [{ titel: "Differentiëren", datum: over(2), type: "Schriftelijk", weging: "20%", stof: "H6 §6.1 t/m §6.5", waar: "Getal & Ruimte deel 2", taken: ["Diagnostische toets H6 maken", "Formulekaart doorlezen", "Foute opgaven opnieuw doen"] }] },
      { naam: "Nederlands", opdrachten: [{ titel: "Boekverslag 2", deadline: over(11), omschrijving: null }], toetsen: [{ titel: "Leesvaardigheid", datum: over(4), type: "Schriftelijk", weging: "15%", stof: "H3 t/m H5 + tekstsoorten", waar: "Nieuw Nederlands, H3 t/m H5", taken: ["Samenvatting H3 t/m H5", "Twee oefenteksten doen"] }] },
      { naam: "Biologie", opdrachten: [], toetsen: [{ titel: "Erfelijkheid", datum: over(6), type: "Schriftelijk", weging: "15%", stof: "Thema 5, BS1 t/m BS6", waar: "Biologie voor jou, thema 5", taken: ["Begrippenlijst leren", "Kruisingsschema's oefenen"] }] },
      { naam: "Scheikunde", opdrachten: [{ titel: "Practicumverslag zuren", deadline: over(5), omschrijving: null }], toetsen: [{ titel: "Reacties en rekenen", datum: over(8), type: "Schriftelijk", weging: "15%", stof: "H5 §1 t/m §4", waar: "Chemie Overal, H5", taken: ["Rekenvoorbeelden doornemen"] }] },
      { naam: "Engels", opdrachten: [], toetsen: [{ titel: "Reading comprehension", datum: over(9), type: "Schriftelijk", weging: "10%", stof: "Unit 4 + idioms list", waar: "Stepping Stones, unit 4", taken: ["Idioms leren", "Oefentekst unit 4"] }] },
      { naam: "Geschiedenis", opdrachten: [], toetsen: [{ titel: "De Koude Oorlog", datum: over(13), type: "Schriftelijk", weging: "10%", stof: "H7 + bronnen p. 40 t/m 62", waar: "Feniks, H7", taken: ["Tijdlijn maken", "Bronvragen oefenen"] }] },
      { naam: "Economie", opdrachten: [], toetsen: [{ titel: "Markt en overheid", datum: over(16), type: "Schriftelijk", weging: "10%", stof: "H4", waar: "Praktische Economie, H4", taken: ["Grafieken oefenen"] }] },
      { naam: "Frans", opdrachten: [], toetsen: [{ titel: "Vocabulaire unité 3", datum: over(20), type: "Mondeling", weging: "5%", stof: "Unité 3, woorden A en B", waar: "Grandes Lignes, unité 3", taken: ["Woorden A en B leren"] }] },
    ],
  };
}
