"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOpslag } from "@/lib/store";
import { komendeToetsen, vakKleur } from "@/lib/afleiden";
import { googleAgendaLink, naarIcs, type ChatBericht, type Plan } from "@/lib/plan";

const PLAN_KEY = "studie-overzicht:plan:v1";

type PlanOpslag = { plan: Plan; gesprek: ChatBericht[] };

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (raw) setOpslag(JSON.parse(raw));
    } catch {
      /* geen opslag */
    }
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

  const toetsen = komendeToetsen(data.dsw, data.uitgezet);
  const gesprek = opslag?.gesprek ?? [];
  const plan = opslag?.plan;

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
      try {
        localStorage.setItem(PLAN_KEY, JSON.stringify(nieuw));
      } catch {
        /* opslag vol of geblokkeerd */
      }
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
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
    setOpslag(null);
    try {
      localStorage.removeItem(PLAN_KEY);
    } catch {
      /* */
    }
  }

  const perDag = groepeerPerDag(plan?.blokken ?? []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-extrabold tracking-tight">Planner</h1>
          <p className="text-muted mt-1">Vertel wanneer je kunt, en de AI maakt een leerschema voor je {toetsen.length} komende toetsen.</p>
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
        {/* Chat */}
        <section aria-label="Chat met de planner" className="flex-[1_1_340px] rounded-3xl bg-white border border-line p-5 flex flex-col gap-3 lg:sticky lg:top-5">
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
        </section>

        {/* Schema */}
        <section aria-label="Leerschema" className="flex-[999_1_520px] min-w-0 flex flex-col gap-4">
          {perDag.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-[#C9CCD8] p-10 text-center text-muted">Je leerschema verschijnt hier.</div>
          )}
          {perDag.map(([datum, blokken]) => (
            <div key={datum} className="rounded-3xl bg-white border border-line p-5">
              <h2 className="text-[15px] font-extrabold mb-3">
                {dagKop(datum)}
              </h2>
              <div className="flex flex-col gap-2.5">
                {blokken.map((b, i) => (
                  <div key={i} className="flex gap-3.5 items-start p-3 rounded-2xl bg-[#F7F8FB]">
                    <div className="w-[52px] shrink-0 text-center">
                      <div className="text-sm font-extrabold">{b.start}</div>
                      <div className="text-xs text-muted">{b.eind}</div>
                    </div>
                    <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: vakKleur(data.dsw, b.vak) }} />
                    <div className="grow min-w-0">
                      <div className="text-xs font-bold text-muted">{b.vak}</div>
                      <div className="text-sm font-bold">{b.taak}</div>
                      <div className="text-[13px] text-[#3B3F4C] mt-0.5">{b.methode}</div>
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

function groepeerPerDag(blokken: Plan["blokken"]) {
  const m = new Map<string, Plan["blokken"]>();
  for (const b of [...blokken].sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start))) {
    m.set(b.datum, [...(m.get(b.datum) ?? []), b]);
  }
  return [...m.entries()];
}

function dagKop(datum: string) {
  const t = new Date(datum + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
