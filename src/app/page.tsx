"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOpslag, slaNieuweDswOp, vernieuwViaLink, VERNIEUW_NA_DAGEN } from "@/lib/store";
import { demoDsw } from "@/lib/demo";
import { datumKort, datumLang, dagenTot, komendeToetsen, overLabel, vakKleur, wijzigingen } from "@/lib/afleiden";

const dagWoord = (d: number) => (d === 1 ? "dag" : "dagen");

export default function Home() {
  const { data, klaar, update, herlaad } = useOpslag();
  const [vernieuwen, setVernieuwen] = useState<"bezig" | "fout" | null>(null);
  const alGeprobeerd = useRef(false);

  async function vernieuw() {
    if (!data?.link) return;
    setVernieuwen("bezig");
    try {
      await vernieuwViaLink(data.link);
      herlaad();
      setVernieuwen(null);
    } catch {
      setVernieuwen("fout");
    }
  }

  // Gekoppelde DSW automatisch opnieuw inlezen als hij een paar dagen oud is.
  useEffect(() => {
    if (!data?.link || alGeprobeerd.current) return;
    const oud = (Date.now() - new Date(data.ingelezenOp).getTime()) / 86_400_000 > VERNIEUW_NA_DAGEN;
    if (oud) {
      alGeprobeerd.current = true;
      vernieuw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.link, data?.ingelezenOp]);

  if (!klaar) return null;

  if (!data) {
    return (
      <section className="rounded-3xl bg-ink text-white p-10 flex flex-col gap-5 max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">Al je toetsen uit de DSW, eindelijk overzichtelijk.</h1>
        <p className="text-[#C7CAD6] text-lg leading-relaxed">
          Upload je DSW en de AI haalt alle toetsen, opdrachten, stof en weging eruit. Je ziet meteen wat er aankomt en wat je moet doen.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/upload" className="min-h-12 px-6 rounded-xl bg-accent font-bold grid place-items-center hover:bg-[#4338CA]">DSW toevoegen</Link>
          <button
            type="button"
            onClick={() => {
              slaNieuweDswOp(demoDsw(), new Date().toISOString(), null);
              location.reload();
            }}
            className="min-h-12 px-6 rounded-xl bg-[#2A2D36] font-bold hover:bg-[#363a45]"
          >
            Bekijk met voorbeelddata
          </button>
        </div>
      </section>
    );
  }

  const { dsw, uitgezet, afgevinkt } = data;
  const komend = komendeToetsen(dsw, uitgezet);
  const eerste = komend[0];
  const binnen2weken = komend.filter((t) => t.dagen <= 14).length;
  const veranderd = wijzigingen(data.vorige, dsw);
  const actieveVakken = dsw.vakken
    .filter((v) => !uitgezet.includes(v.naam))
    .map((v) => {
      const volgende = komend.find((t) => t.vak === v.naam);
      return { ...v, volgende, kleur: vakKleur(dsw, v.naam) };
    })
    .sort((a, b) => (a.volgende?.dagen ?? 999) - (b.volgende?.dagen ?? 999));

  const toggleVak = (naam: string) =>
    update((d) => d && { ...d, uitgezet: d.uitgezet.includes(naam) ? d.uitgezet.filter((x) => x !== naam) : [...d.uitgezet, naam] });
  const toggleTaak = (id: string) =>
    update((d) => d && { ...d, afgevinkt: d.afgevinkt.includes(id) ? d.afgevinkt.filter((x) => x !== id) : [...d.afgevinkt, id] });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted mb-1">{new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-[32px] font-extrabold tracking-tight leading-tight">
            Je hebt {binnen2weken} {binnen2weken === 1 ? "toets" : "toetsen"} in de komende 2 weken
          </h1>
        </div>
        <div className="flex items-center gap-2.5 pl-3.5 pr-1.5 py-1.5 min-h-11 rounded-xl bg-white border border-line text-[13px] text-[#4B5060]">
          <span className={`size-2 rounded-full ${vernieuwen === "bezig" ? "bg-[#F59E0B] animate-pulse" : vernieuwen === "fout" ? "bg-[#DC2626]" : "bg-[#16A34A]"}`} />
          {vernieuwen === "bezig"
            ? "DSW wordt bijgewerkt…"
            : vernieuwen === "fout"
              ? "Bijwerken mislukt"
              : `DSW ingelezen ${new Date(data.ingelezenOp).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" })}`}
          {data.link && vernieuwen !== "bezig" && (
            <button type="button" onClick={vernieuw} className="ml-1 px-3 py-1.5 rounded-lg bg-[#EEF0FF] text-[#3730A3] font-bold hover:bg-[#E0E3FF]">
              Nu bijwerken
            </button>
          )}
        </div>
      </div>

      {veranderd.length > 0 && (
        <div className="flex gap-3 items-start px-4 py-3.5 rounded-2xl bg-[#FFF7ED] border border-[#FED7AA] text-sm text-[#7C2D12] leading-relaxed">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9A3412" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-px"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
          <div>
            <strong>{veranderd.length} {veranderd.length === 1 ? "wijziging" : "wijzigingen"} sinds de vorige DSW:</strong>
            <ul className="list-disc pl-5 mt-1">{veranderd.slice(0, 6).map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        {eerste && (
          <section aria-label="Eerstvolgende toets" className="flex-[999_1_560px] min-w-0 rounded-3xl bg-ink text-white p-7 flex flex-wrap gap-7">
            <div className="flex-[1_1_220px] flex flex-col gap-3.5">
              <span className="self-start px-3 py-1.5 rounded-full bg-[#2A2D36] text-xs font-bold tracking-wider uppercase text-[#C7CAD6]">Eerstvolgende toets</span>
              <div className="flex items-center gap-2.5">
                <span className="size-3 rounded-full" style={{ background: eerste.kleur }} />
                <span className="text-[15px] font-bold text-[#E4E6EE]">{eerste.vak}</span>
              </div>
              <h2 className="text-[28px] font-extrabold tracking-tight leading-tight">{eerste.titel}</h2>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[88px] font-extrabold leading-[0.9] tracking-tighter">{eerste.dagen}</span>
                <span className="text-lg font-bold text-[#C7CAD6]">{eerste.dagen === 0 ? "vandaag!" : dagWoord(eerste.dagen)}</span>
              </div>
              <span className="text-sm text-[#C7CAD6]">
                {datumLang(eerste.datum)}
                {eerste.weging && <> · telt {eerste.weging} mee</>}
              </span>
            </div>
            <div className="flex-[1_1_260px] flex flex-col gap-4 p-5 rounded-[18px] bg-[#22252E]">
              <Blok label="Stof">{eerste.stof}</Blok>
              {eerste.waar && <Blok label="Waar te vinden">{eerste.waar}</Blok>}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#A9ADBC] mb-2">Wat je moet doen</div>
                <div className="flex flex-col gap-2">
                  {eerste.taken.map((taak) => {
                    const id = `${eerste.id}|${taak}`;
                    return (
                      <label key={id} className="flex items-center gap-2.5 text-sm text-[#F2F3F7] cursor-pointer min-h-7">
                        <input type="checkbox" checked={afgevinkt.includes(id)} onChange={() => toggleTaak(id)} className="size-[18px] accent-[#818CF8]" />
                        <span className={afgevinkt.includes(id) ? "line-through text-[#A9ADBC]" : ""}>{taak}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        <section aria-label="Komende toetsen" className="flex-[1_1_320px] rounded-3xl bg-white border border-line p-5.5 flex flex-col gap-1.5">
          <h2 className="text-[17px] font-extrabold mb-2">Komende toetsen</h2>
          {komend.length === 0 && <p className="text-sm text-muted">Geen toetsen gevonden met een datum.</p>}
          {komend.slice(0, 6).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 px-1 border-b border-[#F0F1F5] last:border-0">
              <span className="size-2.5 rounded-full shrink-0" style={{ background: t.kleur }} />
              <div className="grow min-w-0">
                <div className="text-sm font-bold">{t.vak}</div>
                <div className="text-[13px] text-muted truncate">{t.titel} · {datumKort(t.datum)}</div>
              </div>
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${t.dagen <= 3 ? "bg-[#FFEDD5] text-[#9A3412]" : t.dagen <= 7 ? "bg-[#EEF0FF] text-[#3730A3]" : "bg-[#F2F3F7] text-[#3B3F4C]"}`}>
                {overLabel(t.dagen)}
              </span>
            </div>
          ))}
        </section>
      </div>

      <section aria-labelledby="vakken-kop" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="vakken-kop" className="text-xl font-extrabold">Mijn vakken</h2>
          <span className="text-[13px] text-muted">Zet uit welke vakken je niet hebt</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {dsw.vakken.map((v) => {
            const aan = !uitgezet.includes(v.naam);
            const k = vakKleur(dsw, v.naam);
            return (
              <button
                key={v.naam}
                type="button"
                aria-pressed={aan}
                onClick={() => toggleVak(v.naam)}
                className={`flex items-center gap-2 min-h-11 px-4 rounded-full text-sm font-bold border-2 transition ${aan ? "bg-white text-ink" : "bg-[#EDEEF2] text-muted border-transparent line-through"}`}
                style={aan ? { borderColor: k } : undefined}
              >
                <span className="size-2.5 rounded-full" style={{ background: aan ? k : "#B4B8C5" }} />
                {v.naam}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Per vak" className="grid gap-4.5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {actieveVakken.map((v) => {
          const t = v.volgende ?? v.toetsen[0];
          const d = t ? dagenTot(t.datum) : null;
          return (
            <article key={v.naam} className="bg-white border border-line rounded-[20px] overflow-hidden flex flex-col">
              <div className="h-1.5" style={{ background: v.kleur }} />
              <div className="p-5 flex flex-col gap-3.5 grow">
                <div className="flex items-center justify-between gap-2.5">
                  <h3 className="text-lg font-extrabold">{v.naam}</h3>
                  {t?.weging && <span className="px-2.5 py-1 rounded-full bg-[#F2F3F7] text-xs font-bold text-[#3B3F4C]">weegt {t.weging}</span>}
                </div>
                {t ? (
                  <>
                    <div className="flex items-center gap-3.5 px-3.5 py-3 rounded-2xl bg-[#F7F8FB]">
                      <div className="flex flex-col items-center min-w-12">
                        <span className="text-[26px] font-extrabold leading-none tracking-tight">{d !== null && d >= 0 ? d : "–"}</span>
                        <span className="text-[11px] font-bold text-muted">{d !== null && d >= 0 ? dagWoord(d) : "geweest"}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{t.titel}</div>
                        <div className="text-[13px] text-muted">{t.type} · {datumLang(t.datum)}</div>
                      </div>
                    </div>
                    <Regel icoon="boek"><strong>Stof:</strong> {t.stof}</Regel>
                    {t.waar && <Regel icoon="pin">{t.waar}</Regel>}
                  </>
                ) : (
                  <p className="text-sm text-muted">Geen toetsen in deze DSW.</p>
                )}
                {v.opdrachten.map((o) => (
                  <div key={o.titel} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-[#C9CCD8] text-[13px] text-[#3B3F4C]">
                    <span className="grow">{o.titel}</span>
                    {o.deadline && <strong>{datumKort(o.deadline)}</strong>}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function Blok({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-[#A9ADBC] mb-1.5">{label}</div>
      <div className="text-[15px] leading-relaxed text-[#F2F3F7]">{children}</div>
    </div>
  );
}

function Regel({ icoon, children }: { icoon: "boek" | "pin"; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start text-sm leading-relaxed">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6070" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
        {icoon === "boek" ? (
          <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 21.5M8 7h7" />
        ) : (
          <>
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </>
        )}
      </svg>
      <div>{children}</div>
    </div>
  );
}
