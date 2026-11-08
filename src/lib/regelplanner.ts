import type { Blok, Plan } from "./plan";
import type { ToetsItem } from "./afleiden";

// Planner zonder AI, gebaseerd op leertechnieken:
// - gespreid leren: sessies verdeeld over meerdere dagen, eerder beginnen bij zware toetsen
// - herhaling 1 dag voor de toets, geen nieuwe stof op de laatste dag
// - blokken van 45 minuten, max 3 blokken per dag, vakken afwisselen

export type Moment = { dag: number; start: string; eind: string }; // dag: 0 = zondag … 6 = zaterdag

/** Iets wat je deze week af wilt hebben. dag = uiterlijk op deze weekdag (0 = zondag), null = deze week. */
export type Weekdoel = { id: string; titel: string; vak: string | null; minuten: number; dag: number | null; klaar?: boolean };

const EIGEN_METHODE = "Eén ding tegelijk: telefoon weg, timer aan, en pas stoppen als het blok om is";

const BLOK_MIN = 45;
const PAUZE_MIN = 10;
const MAX_PER_DAG = 3;

const SESSIES: Record<string, number> = { "PTA-toets": 4, Schoolexamen: 4, Proefwerk: 3, Toets: 3, Mondeling: 2, SO: 2 };
// Hoeveel dagen vóór de toets elke sessie ideaal valt (laatste = herhaling).
const SPREIDING: Record<number, number[]> = { 1: [1], 2: [3, 1], 3: [6, 3, 1], 4: [10, 6, 3, 1] };

const METHODES = [
  "Eerst overzicht: lees de stof en maak een korte samenvatting of mindmap",
  "Actief oefenen: maak opgaven zonder je boek, kijk daarna na",
  "Overhoor jezelf: leg de stof hardop uit of gebruik flashcards",
  "Herhalen: alleen je fouten en lastige stukken, geen nieuwe stof",
];

export function maakPlan(toetsen: ToetsItem[], momenten: Moment[], afgevinkt: string[], nu = new Date(), weekdoelen: Weekdoel[] = []): Plan {
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
  const doelenNiet: string[] = [];

  // 1. Je eigen weekdoelen: opgeknipt in blokken van max 45 min, verdeeld over de dagen tot je deadline.
  const vrijeMinuten = (d: Date) => slotsOp(d).reduce((som, s) => som + Math.max(0, s.eind - s.start), 0);
  const doelVolgorde = weekdoelen
    .filter((w) => !w.klaar && w.minuten > 0)
    .map((w) => ({ w, laatste: w.dag === null ? 6 : (w.dag - vandaag.getDay() + 7) % 7 }))
    .sort((a, b) => a.laatste - b.laatste);
  for (const { w, laatste } of doelVolgorde) {
    let rest = w.minuten;
    let deel = 0;
    const delen = Math.ceil(w.minuten / BLOK_MIN);
    while (rest > 0) {
      const duur = Math.min(BLOK_MIN, rest);
      // Kies de dag (t/m de deadline) met de meeste vrije tijd, zodat het werk verspreid wordt.
      const dagen = [...range(0, laatste, 1)].map((o) => plusDagen(vandaag, o));
      const opties = dagen
        .map((d) => ({ d, slot: slotsOp(d).find((s) => s.eind - s.start >= duur), vrij: vrijeMinuten(d), al: (gebruikt.get(iso(d)) ?? []).some((b) => b.taak.startsWith(w.titel)) }))
        .filter((x) => x.slot)
        .sort((a, b) => Number(a.al) - Number(b.al) || b.vrij - a.vrij || a.d.getTime() - b.d.getTime());
      const keuze = opties[0];
      if (!keuze || !keuze.slot) {
        doelenNiet.push(w.titel);
        break;
      }
      deel++;
      const key = iso(keuze.d);
      const blok: Blok = {
        datum: key,
        start: tijd(keuze.slot.start),
        eind: tijd(keuze.slot.start + duur),
        vak: w.vak ?? "Eigen taak",
        taak: delen > 1 ? `${w.titel} (deel ${deel} van ${delen})` : w.titel,
        methode: EIGEN_METHODE,
      };
      keuze.slot.start += duur + PAUZE_MIN;
      gebruikt.set(key, [...(gebruikt.get(key) ?? []), blok]);
      blokken.push(blok);
      rest -= duur;
    }
  }

  // Delen op volgorde van tijd nummeren (deel 1 is het eerste blok in je week).
  for (const { w } of doelVolgorde) {
    const eigen = blokken.filter((b) => b.methode === EIGEN_METHODE && b.taak.startsWith(`${w.titel} (deel `)).sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
    eigen.forEach((b, i) => (b.taak = `${w.titel} (deel ${i + 1} van ${eigen.length})`));
  }

  // 2. Toetsen voorbereiden in de tijd die over is.

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
        const toetsBlokken = dagBlokken.filter((b) => b.methode !== EIGEN_METHODE);
        if (toetsBlokken.length >= MAX_PER_DAG) continue;
        if (toetsBlokken.some((b) => b.vak === t.vak)) continue; // vakken afwisselen
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
  const uniekDoelNiet = [...new Set(doelenNiet)];
  const aantalDoelen = doelVolgorde.length;
  const antwoord = blokken.length
    ? `Ik heb ${blokken.length} blokken ingepland` +
      (aantalDoelen ? `: je ${aantalDoelen === 1 ? "weektaak" : `${aantalDoelen} weektaken`} en je toetsvoorbereiding.` : ` voor ${new Set(blokken.map((b) => b.vak)).size} vakken.`) +
      (uniekDoelNiet.length ? ` Niet (helemaal) gelukt: ${uniekDoelNiet.join(", ")}. Voeg meer tijd toe of kies een latere dag.` : "") +
      (uniekNiet.length ? ` Voor ${uniekNiet.join(", ")} was niet genoeg tijd om te leren: voeg meer momenten toe.` : "")
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
