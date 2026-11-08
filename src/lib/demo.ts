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
      { naam: "Wiskunde B", groepen: [], opdrachten: [], toetsen: [{ titel: "Differentiëren", datum: over(2), type: "Schoolexamen", weging: "20%", stof: "H6 §6.1 t/m §6.5", waar: "Getal & Ruimte deel 2", taken: ["Diagnostische toets H6 maken", "Formulekaart doorlezen", "Foute opgaven opnieuw doen"], groep: null }] },
      { naam: "Nederlands", groepen: [], opdrachten: [{ titel: "Boekverslag 2", deadline: over(11), omschrijving: null, type: "Taak", weging: null, groep: null }], toetsen: [{ titel: "Leesvaardigheid", datum: over(4), type: "Proefwerk", weging: "15%", stof: "H3 t/m H5 + tekstsoorten", waar: "Nieuw Nederlands, H3 t/m H5", taken: ["Samenvatting H3 t/m H5", "Twee oefenteksten doen"], groep: null }] },
      { naam: "Biologie", groepen: [], opdrachten: [], toetsen: [{ titel: "Erfelijkheid", datum: over(6), type: "Schoolexamen", weging: "15%", stof: "Thema 5, BS1 t/m BS6", waar: "Biologie voor jou, thema 5", taken: ["Begrippenlijst leren", "Kruisingsschema's oefenen"], groep: null }] },
      { naam: "Scheikunde", groepen: [], opdrachten: [{ titel: "Practicumverslag zuren", deadline: over(5), omschrijving: null, type: "Taak", weging: null, groep: null }], toetsen: [{ titel: "Reacties en rekenen", datum: over(8), type: "SO", weging: "15%", stof: "H5 §1 t/m §4", waar: "Chemie Overal, H5", taken: ["Rekenvoorbeelden doornemen"], groep: null }] },
      { naam: "Engels", groepen: [], opdrachten: [], toetsen: [{ titel: "Reading comprehension", datum: over(9), type: "Proefwerk", weging: "10%", stof: "Unit 4 + idioms list", waar: "Stepping Stones, unit 4", taken: ["Idioms leren", "Oefentekst unit 4"], groep: null }] },
      { naam: "Geschiedenis", groepen: [], opdrachten: [], toetsen: [{ titel: "De Koude Oorlog", datum: over(13), type: "Schoolexamen", weging: "10%", stof: "H7 + bronnen p. 40 t/m 62", waar: "Feniks, H7", taken: ["Tijdlijn maken", "Bronvragen oefenen"], groep: null }] },
      { naam: "Economie", groepen: [], opdrachten: [], toetsen: [{ titel: "Markt en overheid", datum: null, type: "Proefwerk", weging: "10%", stof: "H4 · toetsweek", waar: "Praktische Economie, H4", taken: ["Grafieken oefenen"], groep: null }] },
      { naam: "Frans", groepen: [], opdrachten: [], toetsen: [{ titel: "Vocabulaire unité 3", datum: over(20), type: "SO", weging: "5%", stof: "Unité 3, woorden A en B", waar: "Grandes Lignes, unité 3", taken: ["Woorden A en B leren"], groep: null }] },
    ],
  };
}
