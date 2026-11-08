"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOpslag } from "@/lib/store";
import { komendeItems, komendeToetsen, vakKleur } from "@/lib/afleiden";
import { googleAgendaLink, naarIcs, type ChatBericht } from "@/lib/plan";
import { duurTekst, gedaanVoor, isoDag, leertijd, maakPlan, maandagVan, type Gedaan, type Moment, type PlanBlok, type Weekdoel, type WeekPlan } from "@/lib/regelplanner";
import { bewaar as bewaarCloud, SYNC_EVENT } from "@/lib/cloud";

const MOMENTEN_KEY = "studie-overzicht:momenten:v1";
const WEEK_KEY = "studie-overzicht:weekdoelen:v1";
const LOG_KEY = "studie-overzicht:gedaan:v1";
const DAGEN = [1, 2, 3, 4, 5, 6, 0];
const DAGNAAM = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
const STANDAARD: Moment[] = [
  { dag: 1, start: "16:00", eind: "18:00" },
  { dag: 2, start: "16:00", eind: "18:00" },
  { dag: 4, start: "16:00", eind: "18:00" },
  { dag: 6, start: "10:00", eind: "12:00" },
];

const PLAN_KEY = "studie-overzicht:plan:v1";

type PlanOpslag = { plan: WeekPlan; gesprek: ChatBericht[]; perWeek?: Record<string, WeekPlan> };

// Zondag plan je al voor de week erna; anders deze week.
function standaardWeek(nu = new Date()) {
  const m = maandagVan(nu);
  if (nu.getDay() === 0) m.setDate(m.getDate() + 7);
  return isoDag(m);
}
function weekLabel(week: string) {
  const ma = new Date(week + "T00:00:00");
  const zo = new Date(ma);
  zo.setDate(zo.getDate() + 6);
  const f = (d: Date, maand: boolean) => d.toLocaleDateString("nl-NL", maand ? { day: "numeric", month: "short" } : { day: "numeric" });
  return `${f(ma, ma.getMonth() !== zo.getMonth())} – ${f(zo, true)}`;
}

const VOORBEELDEN = [
  "Ik kan ma, di en do na 16:00 en in het weekend 's ochtends",
  "Elke doordeweekse dag van 19:00 tot 21:00, woensdag heb ik training",
  "Ik wil vooral veel tijd voor wiskunde, dat vind ik het moeilijkst",
];

export default function Planner() {
  const { data, klaar } = useOpslag();
  const [opslag, setOpslag] = useState<PlanOpslag | null>(null);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const eind = useRef<HTMLDivElement>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const [momenten, setMomenten] = useState<Moment[]>(STANDAARD);
  const [weekdoelen, setWeekdoelenState] = useState<Weekdoel[]>([]);
  const setWeekdoelen = (w: Weekdoel[]) => {
    setWeekdoelenState(w);
    bewaarCloud(WEEK_KEY, w);
  };
  const [log, setLogState] = useState<Gedaan[]>([]);
  const setLog = (l: Gedaan[]) => {
    setLogState(l);
    bewaarCloud(LOG_KEY, l);
  };
  const [week, setWeek] = useState(standaardWeek);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((j) => setAi(!!j.ai))
      .catch(() => setAi(false));
    try {
      const raw = localStorage.getItem(MOMENTEN_KEY);
      if (raw) setMomenten(JSON.parse(raw));
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    const laad = () => {
      try {
        const raw = localStorage.getItem(PLAN_KEY);
        setOpslag(raw ? JSON.parse(raw) : null);
        const m = localStorage.getItem(MOMENTEN_KEY);
        if (m) setMomenten(JSON.parse(m));
        const w = localStorage.getItem(WEEK_KEY);
        setWeekdoelenState(w ? JSON.parse(w) : []);
        const l = localStorage.getItem(LOG_KEY);
        setLogState(l ? JSON.parse(l) : []);
      } catch {
        /* geen opslag */
      }
    };
    laad();
    window.addEventListener(SYNC_EVENT, laad);
    return () => window.removeEventListener(SYNC_EVENT, laad);
  }, []);

  useEffect(() => {
    eind.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [opslag?.gesprek.length, bezig]);

  if (!klaar) return null;

  if (!data) {
    return (
      <section className="rounded-3xl bg-white border border-line p-8 max-w-2xl flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold">Eerst je DSW</h1>
        <p className="text-muted">De planner plant op basis van je toetsen, dus upload eerst je DSW.</p>
        <Link href="/upload" className="self-start min-h-11 px-5 rounded-xl bg-accent text-white font-bold grid place-items-center">DSW uploaden</Link>
      </section>
    );
  }

  const toetsen = komendeToetsen(data.dsw, data);
  const gesprek = opslag?.gesprek ?? [];
  const opgeslagenPlan = opslag?.plan;
  // Een plan zonder week (AI) altijd tonen; een weekplan alleen in zijn eigen week.
  const plan = opslag?.perWeek?.[week] ?? (opgeslagenPlan && (!opgeslagenPlan.week || opgeslagenPlan.week === week) ? opgeslagenPlan : undefined);
  const dezeWeek = isoDag(maandagVan(new Date()));
  const volgendeWeek = isoDag(new Date(new Date(dezeWeek + "T00:00:00").getTime() + 7 * 86_400_000));
  const doelenVanWeek = weekdoelen.filter((w) => !w.week || w.week === week);

  async function stuur(tekst: string) {
    if (!tekst.trim() || bezig || !data) return;
    const nieuwGesprek: ChatBericht[] = [...gesprek, { rol: "leerling", tekst: tekst.trim() }];
    setOpslag((o) => ({ plan: o?.plan ?? { antwoord: "", blokken: [], tips: [] }, gesprek: nieuwGesprek }));
    setInvoer("");
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vandaag: new Date().toISOString().slice(0, 10),
          toetsen: toetsen.map(({ vak, titel, datum, weging, stof, waar, taken, type }) => ({ vak, titel, datum, weging, stof, waar, taken, type })),
          afgevinkt: data.afgevinkt,
          gesprek: nieuwGesprek.slice(-20),
          vorigPlan: plan?.blokken.length ? plan : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Er ging iets mis.");
      const nieuw: PlanOpslag = { plan: json.plan, gesprek: [...nieuwGesprek, { rol: "planner", tekst: json.plan.antwoord }] };
      setOpslag(nieuw);
      bewaarCloud(PLAN_KEY, nieuw);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  function bewaar(nieuw: PlanOpslag) {
    const perWeek = { ...(opslag?.perWeek ?? {}) };
    if (nieuw.plan.week) perWeek[nieuw.plan.week] = nieuw.plan;
    // Alleen de laatste paar weken bewaren.
    for (const w of Object.keys(perWeek).sort().slice(0, -4)) delete perWeek[w];
    const metWeken = { ...nieuw, perWeek };
    setOpslag(metWeken);
    bewaarCloud(PLAN_KEY, metWeken);
  }

  function planZonderAi(m: Moment[], voorWeek = week) {
    if (!data) return;
    bewaarCloud(MOMENTEN_KEY, m);
    const doelen = weekdoelen.filter((w) => !w.week || w.week === voorWeek);
    bewaar({ plan: maakPlan({ toetsen, momenten: m, afgevinkt: data.afgevinkt, weekdoelen: doelen, log, week: voorWeek, vorigPlan: opslag?.perWeek?.[voorWeek] ?? (opgeslagenPlan?.week === voorWeek ? opgeslagenPlan : null) }), gesprek: [] });
  }

  function kiesWeek(w: string) {
    setWeek(w);
    if (!opslag?.perWeek?.[w] && opgeslagenPlan?.week !== w && momenten.length) planZonderAi(momenten, w);
  }

  function wisselGedaan(b: PlanBlok) {
    if (!plan || !b.id || !b.doel) return;
    const gedaan = !b.gedaan;
    const blokken = plan.blokken.map((x) => (x.id === b.id ? { ...x, gedaan } : x));
    bewaar({ plan: { ...plan, blokken }, gesprek: opslag?.gesprek ?? [] });
    setLog(gedaan ? [...log.filter((g) => g.id !== b.id), { id: b.id, doel: b.doel, minuten: b.minuten ?? 45, datum: b.datum }] : log.filter((g) => g.id !== b.id));
  }

  function downloadIcs() {
    if (!plan) return;
    const blob = new Blob([naarIcs(plan.blokken)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leerplanning.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  function opnieuw() {
    // Alleen het schema van deze week weggooien; je voortgang blijft bewaard.
    const perWeek = { ...(opslag?.perWeek ?? {}) };
    delete perWeek[week];
    const rest = Object.values(perWeek);
    if (!rest.length) {
      setOpslag(null);
      bewaarCloud(PLAN_KEY, null);
      return;
    }
    const nieuw = { plan: rest[rest.length - 1], gesprek: [], perWeek };
    setOpslag(nieuw);
    bewaarCloud(PLAN_KEY, nieuw);
  }

  const perDag = groepeerPerDag(plan?.blokken ?? []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold tracking-tight">Planner</h1>
          <p className="text-muted mt-1">{ai ? "Vertel wanneer je kunt, en de AI maakt een leerschema" : "Kies wanneer je kunt, en je krijgt een slim leerschema"} voor je {toetsen.length} komende toetsen.</p>
        </div>
        {plan && plan.blokken.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadIcs} className="flex items-center gap-2 min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-bold hover:bg-[#4338CA]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M12 12v6M9 15l3 3 3-3" /></svg>
              Alles naar je agenda
            </button>
            <button type="button" onClick={opnieuw} className="min-h-11 px-4 rounded-xl bg-white border border-line text-sm font-bold hover:bg-ground">Opnieuw beginnen</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {ai === false && (
          <div className="flex-[1_1_360px] min-w-0 flex flex-col gap-4">
            <MomentenKiezer momenten={momenten} setMomenten={setMomenten} />
            <WeekdoelenKiezer
              doelen={doelenVanWeek}
              setDoelen={(nieuw) => setWeekdoelen([...weekdoelen.filter((w) => w.week && w.week !== week), ...nieuw.map((w) => ({ ...w, week: w.week ?? week }))])}
              log={log}
              week={week}
              vakken={data.dsw.vakken.map((v) => v.naam).filter((n) => !data.uitgezet.includes(n))}
              suggesties={komendeItems(data.dsw, data)
                .filter((i) => !(i.soort === "taak" && data.afgevinkt.includes(i.id)) && (i.soort === "toets" || i.dagen <= 21))
                .slice(0, 40)
                .map((i) => {
                  // Binnen een week: af vóór die dag (toets: de dag ervoor). Later: gewoon deze week.
                  const afDag = i.soort === "toets" ? i.dagen - 1 : i.dagen;
                  const d = new Date(i.datum + "T00:00:00");
                  if (i.soort === "toets") d.setDate(d.getDate() - 1);
                  return {
                    toets: i.soort === "toets" ? i.id : undefined,
                    soort: i.soort,
                    titel: i.soort === "toets" ? `Leren voor ${i.titel}` : i.titel,
                    vak: i.vak,
                    datum: i.datum,
                    dag: afDag >= 0 && afDag <= 6 ? d.getDay() : null,
                    minuten: i.soort === "toets" ? 90 : 30,
                  };
                })}
            />
            <button type="button" onClick={() => planZonderAi(momenten)} className="min-h-12 rounded-xl bg-accent text-white font-bold hover:bg-[#4338CA]">
              {plan ? "Planning bijwerken" : "Maak mijn planning"}
            </button>
            {plan?.antwoord && <p className="text-sm text-[#3B3F4C] bg-white border border-line rounded-xl px-3.5 py-2.5">{plan.antwoord}</p>}
          </div>
        )}
        {/* Chat */}
        {ai && <section aria-label="Chat met de planner" className="flex-[1_1_340px] rounded-3xl bg-white border border-line p-5 flex flex-col gap-3 lg:sticky lg:top-5">
          <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
            {gesprek.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Wanneer kun je leren? Probeer bijvoorbeeld:</p>
                {VOORBEELDEN.map((v) => (
                  <button key={v} type="button" onClick={() => stuur(v)} className="text-left text-sm px-3.5 py-2.5 rounded-xl bg-[#F7F8FB] border border-line hover:border-accent">
                    {v}
                  </button>
                ))}
              </div>
            )}
            {gesprek.map((b, i) => (
              <div key={i} className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${b.rol === "leerling" ? "self-end bg-accent text-white rounded-br-md" : "self-start bg-[#F2F3F7] rounded-bl-md"}`}>
                {b.tekst}
              </div>
            ))}
            {bezig && <div className="self-start px-3.5 py-2.5 rounded-2xl bg-[#F2F3F7] text-sm text-muted animate-pulse">Even plannen…</div>}
            <div ref={eind} />
          </div>
          {fout && <p role="alert" className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] px-3 py-2 text-sm">{fout}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              stuur(invoer);
            }}
            className="flex gap-2"
          >
            <label htmlFor="planner-invoer" className="sr-only">Bericht aan de planner</label>
            <input
              id="planner-invoer"
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              placeholder={plan?.blokken.length ? "Bijv. zaterdag kan ik toch niet" : "Wanneer kun je?"}
              className="grow min-w-0 min-h-11 px-3.5 rounded-xl border border-line text-sm"
            />
            <button type="submit" disabled={bezig || !invoer.trim()} className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-50">
              Stuur
            </button>
          </form>
        </section>}

        {/* Schema */}
        <section aria-label="Leerschema" className="flex-[999_1_520px] min-w-0 flex flex-col gap-4">
          {ai === false && (
            <div role="tablist" aria-label="Week" className="flex gap-1 p-1 rounded-2xl bg-white border border-line">
              {[
                { w: dezeWeek, label: "Deze week" },
                { w: volgendeWeek, label: "Volgende week" },
              ].map(({ w, label }) => (
                <button key={w} role="tab" aria-selected={week === w} type="button" onClick={() => kiesWeek(w)} className={`flex-1 min-h-12 rounded-xl text-sm font-bold flex flex-col items-center justify-center leading-tight ${week === w ? "bg-ink text-white" : "text-[#3B3F4C] hover:bg-ground"}`}>
                  {label}
                  <span className={`text-xs font-semibold ${week === w ? "text-[#C7CAD6]" : "text-muted"}`}>{weekLabel(w)}</span>
                </button>
              ))}
            </div>
          )}
          {ai === false && <Voortgang toetsen={toetsen} doelen={doelenVanWeek} log={log} week={week} kleur={(vak) => vakKleur(data.dsw, vak)} />}
          {perDag.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-[#C9CCD8] p-10 text-center text-muted">
              {opgeslagenPlan?.week && !plan ? "Nog geen planning voor deze week. Tik op “Maak mijn planning”." : "Je leerschema voor deze week verschijnt hier."}
            </div>
          )}
          {perDag.map(([datum, blokken]) => (
            <div key={datum} className="rounded-3xl bg-white border border-line p-5">
              <h2 className="text-[15px] font-extrabold mb-3">
                {dagKop(datum)}
              </h2>
              <div className="flex flex-col gap-2.5">
                {blokken.map((b, i) => (
                  <div key={i} className={`flex gap-3 sm:gap-3.5 items-start p-3 rounded-2xl ${b.gedaan ? "bg-[#F0FDF4]" : "bg-[#F7F8FB]"}`}>
                    {b.id && b.doel && (
                      <input type="checkbox" checked={!!b.gedaan} onChange={() => wisselGedaan(b)} aria-label={`${b.taak} gedaan`} className="size-5 mt-0.5 accent-[#16A34A] shrink-0" />
                    )}
                    <div className="w-[46px] sm:w-[52px] shrink-0 text-center">
                      <div className="text-sm font-extrabold">{b.start}</div>
                      <div className="text-xs text-muted">{b.eind}</div>
                    </div>
                    <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: data.dsw.vakken.some((v) => v.naam === b.vak) ? vakKleur(data.dsw, b.vak) : "#9CA3AF" }} />
                    <div className="grow min-w-0">
                      <div className="text-xs font-bold text-muted">{b.vak}</div>
                      <div className={`text-sm font-bold ${b.gedaan ? "line-through text-muted" : ""}`}>{b.taak}</div>
                      {!b.gedaan && <div className="text-[13px] text-[#3B3F4C] mt-0.5">{b.methode}</div>}
                    </div>
                    <a href={googleAgendaLink(b)} target="_blank" rel="noreferrer" aria-label={`${b.taak} toevoegen aan Google Agenda`} className="shrink-0 size-11 rounded-xl grid place-items-center hover:bg-white">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {plan && plan.tips.length > 0 && (
            <div className="rounded-3xl bg-ink text-white p-6">
              <h2 className="text-[15px] font-extrabold mb-3">Leertips voor deze toetsen</h2>
              <ul className="flex flex-col gap-2 text-sm text-[#E4E6EE] leading-relaxed list-disc pl-5">
                {plan.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Voortgang({ toetsen, doelen, log, week, kleur }: { toetsen: ReturnType<typeof komendeToetsen>; doelen: Weekdoel[]; log: Gedaan[]; week: string; kleur: (vak: string) => string }) {
  const rijen = [
    ...doelen
      .filter((w) => !w.toets)
      .map((w) => ({ key: w.id, vak: w.vak ?? "Eigen taak", titel: w.titel, gedaan: gedaanVoor(log, w.id), totaal: w.minuten, kleur: w.vak ? kleur(w.vak) : "#9CA3AF", sub: "deze week" })),
    ...toetsen.slice(0, 8).map((t) => ({ key: t.id, vak: t.vak, titel: t.titel, gedaan: gedaanVoor(log, t.id), totaal: leertijd(t), kleur: t.kleur, sub: t.dagen === 0 ? "vandaag" : `over ${t.dagen} d` })),
  ];
  if (!rijen.length) return null;
  const dezeWeek = log.filter((g) => g.datum >= week).reduce((s, g) => s + g.minuten, 0);
  return (
    <div className="rounded-3xl bg-white border border-line p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-extrabold">Je voortgang</h2>
        <span className="text-xs font-bold text-muted">Deze week geleerd: {duurTekst(dezeWeek)}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rijen.map((r) => {
          const pct = Math.min(100, Math.round((r.gedaan / Math.max(1, r.totaal)) * 100));
          return (
            <div key={r.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-bold">{r.vak}</span> <span className="text-muted">· {r.titel}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums">
                  {duurTekst(r.gedaan)} <span className="text-muted font-semibold">/ {duurTekst(r.totaal)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#EDEEF2] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.vak} ${r.titel}`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "#16A34A" : r.kleur }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Vink blokken af als je ze gedaan hebt. Wat je al geleerd hebt, plant hij niet nog een keer.</p>
    </div>
  );
}

function groepeerPerDag(blokken: PlanBlok[]) {
  const m = new Map<string, PlanBlok[]>();
  for (const b of [...blokken].sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start))) {
    m.set(b.datum, [...(m.get(b.datum) ?? []), b]);
  }
  return [...m.entries()];
}

function dagKop(datum: string) {
  const t = new Date(datum + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function MomentenKiezer({ momenten, setMomenten }: { momenten: Moment[]; setMomenten: (m: Moment[]) => void }) {
  const zet = (index: number, veld: "start" | "eind", waarde: string) => setMomenten(momenten.map((m, i) => (i === index ? { ...m, [veld]: waarde } : m)));
  const wissel = (dag: number) =>
    setMomenten(momenten.some((m) => m.dag === dag) ? momenten.filter((m) => m.dag !== dag) : [...momenten, { dag, start: "16:00", eind: "18:00" }]);
  const extra = (dag: number) => setMomenten([...momenten, { dag, start: "19:00", eind: "20:00" }]);
  const weg = (index: number) => setMomenten(momenten.filter((_, i) => i !== index));
  const invoer = "min-h-10 w-full min-w-0 px-2 rounded-lg border border-line bg-white";

  return (
    <section aria-label="Wanneer kun je leren?" className="rounded-3xl bg-white border border-line p-4 sm:p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-extrabold">1. Wanneer kun je?</h2>
        <p className="text-[13px] text-muted mt-0.5">Tik een dag aan en vul je tijden in. Met + voeg je een tweede tijd toe.</p>
      </div>
      <div className="flex flex-col gap-2">
        {DAGEN.map((dag) => {
          const regels = momenten.map((m, index) => ({ m, index })).filter((x) => x.m.dag === dag);
          const aan = regels.length > 0;
          return (
            <div key={dag} className="flex items-start gap-2.5">
              <button
                type="button"
                aria-pressed={aan}
                onClick={() => wissel(dag)}
                className={`w-[60px] shrink-0 min-h-10 rounded-xl text-sm font-bold border-2 ${aan ? "border-accent bg-[#EEF0FF] text-[#3730A3]" : "border-line text-muted"}`}
              >
                <span aria-hidden="true">{DAGNAAM[dag].slice(0, 2)}</span>
                <span className="sr-only">{DAGNAAM[dag]}</span>
              </button>
              {aan ? (
                <div className="grow min-w-0 flex flex-col gap-1.5">
                  {regels.map(({ m, index }, n) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_40px] items-center gap-1.5 text-sm">
                      <label className="sr-only" htmlFor={`start-${index}`}>Begintijd {DAGNAAM[dag]}</label>
                      <TijdVeld id={`start-${index}`} waarde={m.start} onChange={(w) => zet(index, "start", w)} className={invoer} />
                      <span className="text-muted">–</span>
                      <label className="sr-only" htmlFor={`eind-${index}`}>Eindtijd {DAGNAAM[dag]}</label>
                      <TijdVeld id={`eind-${index}`} waarde={m.eind} onChange={(w) => zet(index, "eind", w)} className={invoer} />
                      {n === 0 ? (
                        <button type="button" onClick={() => extra(dag)} aria-label={`Nog een tijd op ${DAGNAAM[dag]}`} className="size-10 shrink-0 rounded-lg grid place-items-center text-accent hover:bg-[#EEF0FF] text-lg font-bold">+</button>
                      ) : (
                        <button type="button" onClick={() => weg(index)} aria-label={`Tijd weghalen op ${DAGNAAM[dag]}`} className="size-10 shrink-0 rounded-lg grid place-items-center text-muted hover:bg-ground text-lg">×</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted min-h-10 grid items-center">kan niet</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Tijd intypen: "16", "1630", "16.30" en "9:15" worden netjes "16:00", "16:30", "09:15".
function normaliseerTijd(tekst: string): string | null {
  const t = tekst.trim().replace(/[.,h ]/g, ":");
  let m = t.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) {
    const cijfers = t.replace(/\D/g, "");
    if (cijfers.length === 3 || cijfers.length === 4) m = ["", cijfers.slice(0, -2), cijfers.slice(-2)] as unknown as RegExpMatchArray;
  }
  if (!m) return null;
  const u = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (u > 23 || min > 59) return null;
  return `${String(u).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function TijdVeld({ id, waarde, onChange, className }: { id: string; waarde: string; onChange: (w: string) => void; className: string }) {
  const [tekst, setTekst] = useState(waarde);
  const [fout, setFout] = useState(false);
  useEffect(() => setTekst(waarde), [waarde]);
  const klaar = () => {
    const n = normaliseerTijd(tekst);
    if (n) {
      setTekst(n);
      setFout(false);
      if (n !== waarde) onChange(n);
    } else {
      setFout(true);
      setTekst(waarde);
    }
  };
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="16:00"
      maxLength={5}
      value={tekst}
      onChange={(e) => setTekst(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={klaar}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      aria-invalid={fout}
      className={`${className} text-center font-semibold tabular-nums ${fout ? "border-[#DC2626]" : ""}`}
    />
  );
}

const DUREN = [15, 30, 45, 60, 90, 120, 180];
const duurLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}u${m % 60}` : `${m / 60} uur`);

function WeekdoelenKiezer({
  doelen,
  setDoelen,
  vakken,
  suggesties,
  log,
  week,
}: {
  doelen: Weekdoel[];
  setDoelen: (w: Weekdoel[]) => void;
  vakken: string[];
  suggesties: { toets?: string; soort: "toets" | "taak"; titel: string; vak: string; dag: number | null; datum: string; minuten: number }[];
  log: Gedaan[];
  week: string;
}) {
  const [toets, setToets] = useState<string | undefined>();
  const gedaanVan = (d: Weekdoel) => (d.toets ? log.filter((g) => g.doel === d.toets && g.datum >= week).reduce((s, g) => s + g.minuten, 0) : gedaanVoor(log, d.id));
  const [titel, setTitel] = useState("");
  const [vak, setVak] = useState("");
  const [minuten, setMinuten] = useState(60);
  const [dag, setDag] = useState<number | null>(null);
  const totaal = doelen.filter((d) => !d.klaar).reduce((s, d) => s + d.minuten, 0);
  const nieuweId = () => Math.random().toString(36).slice(2, 10);

  function voegToe(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setDoelen([...doelen, { id: nieuweId(), titel: titel.trim(), vak: vak || null, minuten, dag, ...(toets ? { toets } : {}) }]);
    setTitel("");
    setToets(undefined);
  }

  const open = suggesties.filter((s) => !doelen.some((d) => d.titel === s.titel && d.vak === s.vak));
  const kies = (index: string) => {
    const s = open[Number(index)];
    if (!s) return;
    setTitel(s.titel);
    setToets(s.toets);
    setVak(s.vak);
    setDag(s.dag);
    setMinuten(s.minuten);
  };
  const veld = "min-h-11 px-3 rounded-xl border border-line bg-white text-sm min-w-0";

  return (
    <section aria-label="Wat wil je deze week af hebben?" className="rounded-3xl bg-white border border-line p-4 sm:p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-extrabold">2. Wat wil je deze week af hebben?</h2>
        <p className="text-[13px] text-muted mt-0.5">Zet hier alles wat af moet. De planner verdeelt het over je uren en plant daarna je toetsen erbij.</p>
      </div>

      {doelen.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {doelen.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#F7F8FB] text-sm">
              <input type="checkbox" checked={!!d.klaar} onChange={() => setDoelen(doelen.map((x) => (x.id === d.id ? { ...x, klaar: !x.klaar } : x)))} aria-label={`${d.titel} is klaar`} className="size-4 accent-[#4F46E5] shrink-0" />
              <span className={`grow min-w-0 ${d.klaar ? "line-through text-muted" : ""}`}>
                <span className="font-bold">{d.titel}</span>
                <span className="block text-xs text-muted">
                  {[d.vak, gedaanVan(d) > 0 ? `${duurLabel(Math.min(gedaanVan(d), d.minuten))} van ${duurLabel(d.minuten)} gedaan` : duurLabel(d.minuten), d.dag !== null ? `uiterlijk ${DAGNAAM[d.dag].toLowerCase()}` : "deze week"].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button type="button" onClick={() => setDoelen(doelen.filter((x) => x.id !== d.id))} aria-label={`${d.titel} weghalen`} className="size-9 shrink-0 rounded-lg grid place-items-center text-muted hover:bg-white text-lg">×</button>
            </li>
          ))}
          <li className="text-xs font-bold text-muted px-1 pt-0.5">Totaal nog: {duurLabel(totaal || 0)}</li>
        </ul>
      )}

      <form onSubmit={voegToe} className="flex flex-col gap-2">
        {open.length > 0 && (
          <>
            <label className="sr-only" htmlFor="doel-kies">Kies uit je taken en toetsen</label>
            <select id="doel-kies" value="" onChange={(e) => kies(e.target.value)} className={`${veld} font-semibold text-[#3730A3] bg-[#EEF0FF] border-[#C7CBFF]`}>
              <option value="">Kies uit je taken en toetsen…</option>
              {(["toets", "taak"] as const).map((soort) =>
                open.some((s) => s.soort === soort) ? (
                  <optgroup key={soort} label={soort === "toets" ? "Komende toetsen" : "Taken uit je DSW"}>
                    {open.map((s, i) =>
                      s.soort === soort ? (
                        <option key={i} value={i}>
                          {s.vak}: {s.titel.replace(/^Leren voor /, "")} ({new Date(s.datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })})
                        </option>
                      ) : null,
                    )}
                  </optgroup>
                ) : null,
              )}
            </select>
            <div className="text-center text-xs text-muted">of typ zelf iets</div>
          </>
        )}
        <label className="sr-only" htmlFor="doel-titel">Wat moet er af?</label>
        <input id="doel-titel" value={titel} onChange={(e) => { setTitel(e.target.value); setToets(undefined); }} placeholder="Bijv. Wiskunde opgaven §6.3, boek lezen…" className={veld} />
        <div className="grid grid-cols-3 gap-2">
          <label className="sr-only" htmlFor="doel-vak">Vak</label>
          <select id="doel-vak" value={vak} onChange={(e) => setVak(e.target.value)} className={veld}>
            <option value="">Geen vak</option>
            {vakken.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <label className="sr-only" htmlFor="doel-duur">Hoe lang</label>
          <select id="doel-duur" value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} className={veld}>
            {DUREN.map((m) => <option key={m} value={m}>{duurLabel(m)}</option>)}
          </select>
          <label className="sr-only" htmlFor="doel-dag">Uiterlijk af</label>
          <select id="doel-dag" value={dag ?? ""} onChange={(e) => setDag(e.target.value === "" ? null : Number(e.target.value))} className={veld}>
            <option value="">Deze week</option>
            {DAGEN.map((d) => <option key={d} value={d}>Voor {DAGNAAM[d].toLowerCase()}</option>)}
          </select>
        </div>
        <button type="submit" disabled={!titel.trim()} className="min-h-11 rounded-xl border-2 border-accent text-accent text-sm font-bold hover:bg-[#EEF0FF] disabled:opacity-40">+ Toevoegen</button>
      </form>

    </section>
  );
}
