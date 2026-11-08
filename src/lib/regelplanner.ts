import type { Blok, Plan } from "./plan";
import type { ToetsItem } from "./afleiden";

// Planner zonder AI, gebaseerd op leertechnieken:
// - gespreid leren: sessies verdeeld over meerdere dagen, eerder beginnen bij zware toetsen
// - herhaling 1 dag voor de toets, geen nieuwe stof op de laatste dag
// - blokken van 45 minuten, max 3 blokken per dag, vakken afwisselen

export type Moment = { dag: number; start: string; eind: string }; // dag: 0 = zondag … 6 = zaterdag

const BLOK_MIN = 45;
const PAUZE_MIN = 10;
const MAX_PER_DAG = 3;

const SESSIES: Record<string, number> = { "PTA-toets": 4, Proefwerk: 3, SO: 2 };
// Hoeveel dagen vóór de toets elke sessie ideaal valt (laatste = herhaling).
const SPREIDING: Record<number, number[]> = { 1: [1], 2: [3, 1], 3: [6, 3, 1], 4: [10, 6, 3, 1] };

const METHODES = [
  "Eerst overzicht: lees de stof en maak een korte samenvatting of mindmap",
  "Actief oefenen: maak opgaven zonder je boek, kijk daarna na",
  "Overhoor jezelf: leg de stof hardop uit of gebruik flashcards",
  "Herhalen: alleen je fouten en lastige stukken, geen nieuwe stof",
];

export function maakPlan(toetsen: ToetsItem[], momenten: Moment[], afgevinkt: string[], nu = new Date()): Plan {
  const vandaag = startVanDag(nu);
  // Per datum: vrije slots (op volgorde)
  const vrij = new Map<string, { start: number; eind: number }[]>();
  const gebruikt = new Map<string, Blok[]>();

  const slotsOp = (d: Date) => {
    const key = iso(d);
    if (!vrij.has(key)) {
      vrij.set(
        key,
        momenten
          .filter((m) => m.dag === d.getDay())
          .map((m) => ({ start: minuten(m.start), eind: minuten(m.eind) }))
          // Vandaag: alleen tijd die nog niet voorbij is
          .map((s) => (key === iso(vandaag) ? { ...s, start: Math.max(s.start, nu.getHours() * 60 + nu.getMinutes() + 5) } : s))
          .sort((a, b) => a.start - b.start),
      );
    }
    return vrij.get(key)!;
  };

  const blokken: Blok[] = [];
  const nietGelukt: string[] = [];

  // Zwaarste en dichtstbijzijnde toetsen eerst plannen.
  const volgorde = [...toetsen].sort((a, b) => a.dagen - b.dagen || (SESSIES[b.type] ?? 2) - (SESSIES[a.type] ?? 2));

  for (const t of volgorde) {
    if (t.dagen < 1) continue; // toets is vandaag: niets meer te plannen
    const aantal = SESSIES[t.type] ?? 2;
    const taken = t.taken.filter((taak) => !afgevinkt.includes(`${t.id}|${taak}`));
    const doelen = SPREIDING[aantal];
    doelen.forEach((dagenVoor, i) => {
      const isHerhaling = i === doelen.length - 1;
      const taak = isHerhaling ? "Herhalen" : taken[i] ?? "Oefenen";
      // Zoek vanaf de ideale dag terug richting vandaag, daarna vooruit tot de dag vóór de toets.
      const ideaal = Math.max(0, Math.min(t.dagen - 1, t.dagen - dagenVoor));
      const kandidaten = [...range(ideaal, 0, -1), ...range(ideaal + 1, t.dagen - 1, 1)];
      for (const offset of kandidaten) {
        const d = plusDagen(vandaag, offset);
        const key = iso(d);
        const dagBlokken = gebruikt.get(key) ?? [];
        if (dagBlokken.length >= MAX_PER_DAG) continue;
        if (dagBlokken.some((b) => b.vak === t.vak)) continue; // vakken afwisselen
        const slot = slotsOp(d).find((s) => s.eind - s.start >= BLOK_MIN);
        if (!slot) continue;
        const blok: Blok = {
          datum: key,
          start: tijd(slot.start),
          eind: tijd(slot.start + BLOK_MIN),
          vak: t.vak,
          taak: `${taak} · ${t.titel}`,
          methode: isHerhaling ? METHODES[3] : METHODES[Math.min(i, 2)],
        };
        slot.start += BLOK_MIN + PAUZE_MIN;
        gebruikt.set(key, [...dagBlokken, blok]);
        blokken.push(blok);
        return;
      }
      nietGelukt.push(t.vak);
    });
  }

  const uniekNiet = [...new Set(nietGelukt)];
  const antwoord = blokken.length
    ? `Ik heb ${blokken.length} leerblokken ingepland voor ${new Set(blokken.map((b) => b.vak)).size} vakken.` +
      (uniekNiet.length ? ` Voor ${uniekNiet.join(", ")} was niet genoeg tijd: voeg meer momenten toe.` : "")
    : "Ik kon nog niets inplannen. Voeg momenten toe waarop je kunt leren.";

  return {
    antwoord,
    blokken: blokken.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start)),
    tips: [
      "Begin met het vak waar je het meest tegenop ziet, dan heb je de meeste energie.",
      "Leg je telefoon in een andere kamer tijdens een leerblok.",
      "Overhoor jezelf in plaats van alleen teruglezen: dat onthoud je veel beter.",
      "Slaap de nacht voor een toets goed, dat helpt meer dan nog een uur extra leren.",
    ],
  };
}

function* range(van: number, tot: number, stap: number) {
  for (let i = van; stap > 0 ? i <= tot : i >= tot; i += stap) if (i >= 0) yield i;
}
const minuten = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const tijd = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const startVanDag = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDagen = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
