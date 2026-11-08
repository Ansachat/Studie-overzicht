"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOpslag, slaNieuweDswOp, vernieuwViaLink, VERNIEUW_NA_DAGEN } from "@/lib/store";
import { demoDsw } from "@/lib/demo";
import { datumKort, datumLang, groepenVan, komendeItems, overLabel, toetsenZonderDatum, vakKleur, type Item } from "@/lib/afleiden";

const dagWoord = (d: number) => (d === 1 ? "dag" : "dagen");

export default function Home() {
  const { data, klaar, update, herlaad } = useOpslag();
  const [vernieuwen, setVernieuwen] = useState<"bezig" | "fout" | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [gekozenVak, setGekozenVak] = useState<string | null>(null);
  const [alleToetsen, setAlleToetsen] = useState(false);
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
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">Al je toetsen en taken uit de DSW, eindelijk overzichtelijk.</h1>
        <p className="text-[#C7CAD6] text-lg leading-relaxed">
          Plak de link van je DSW en je ziet meteen wat er aankomt: toetsen, huiswerk, opdrachten en deadlines, per vak en met afteller.
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
  const groepen = data.groepen ?? {};
  const alles = komendeItems(dsw, { uitgezet, groepen });
  const isKlaar = (i: Item) => i.soort === "taak" && afgevinkt.includes(i.id);
  const eerste = alles.find((i) => !isKlaar(i));
  const toetsen = alles.filter((i) => i.soort === "toets");
  const zonderDatum = toetsenZonderDatum(dsw, { uitgezet, groepen });
  const binnen2weken = { toetsen: toetsen.filter((t) => t.dagen <= 14).length, taken: alles.filter((t) => t.soort === "taak" && t.dagen <= 14 && !isKlaar(t)).length };
  const actieveVakken = dsw.vakken
    .filter((v) => !uitgezet.includes(v.naam))
    .map((v) => {
      const items = alles.filter((i) => i.vak === v.naam);
      return { naam: v.naam, kleur: vakKleur(dsw, v.naam), toets: items.find((i) => i.soort === "toets"), taken: items.filter((i) => i.soort === "taak"), groepen: groepenVan(dsw, v.naam) };
    })
    .sort((a, b) => (a.toets?.dagen ?? 999) - (b.toets?.dagen ?? 999));

  const toggleVak = (naam: string) =>
    update((d) => d && { ...d, uitgezet: d.uitgezet.includes(naam) ? d.uitgezet.filter((x) => x !== naam) : [...d.uitgezet, naam] });
  const toggleAfgevinkt = (id: string) =>
    update((d) => d && { ...d, afgevinkt: d.afgevinkt.includes(id) ? d.afgevinkt.filter((x) => x !== id) : [...d.afgevinkt, id] });
  const kiesGroep = (vak: string, groep: string | null) =>
    update((d) => {
      if (!d) return d;
      const g = { ...(d.groepen ?? {}) };
      if (groep) g[vak] = groep;
      else delete g[vak];
      return { ...d, groepen: g };
    });

  const vakkenSectie = (
    <section aria-labelledby="vakken-kop" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="vakken-kop" className="text-xl font-extrabold">Mijn vakken</h2>
        <span className="text-[13px] text-muted">Tik op een vak om het aan of uit te zetten</span>
      </div>
      {actieveVakken.length === 0 && (
        <div className="rounded-2xl bg-[#EEF0FF] border border-[#C7CBFF] px-4 py-3.5 text-sm text-[#312E81] leading-relaxed">
          <strong>Kies eerst je vakken.</strong> Je DSW bevat alle vakken van je jaarlaag. Zet hieronder alleen de vakken aan die jij hebt. Bij vakken met meerdere klassen of docenten kies je daarna je eigen groep.
        </div>
      )}
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
  );

  if (actieveVakken.length === 0) return vakkenSectie;

  const groepKiezer = (v: (typeof actieveVakken)[number]) =>
    v.groepen.length > 1 && (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-muted mr-1">Jouw groep:</span>
        {v.groepen.map((g) => {
          const gekozen = groepen[v.naam] === g;
          return (
            <button key={g} type="button" aria-pressed={gekozen} onClick={() => kiesGroep(v.naam, gekozen ? null : g)} className={`min-h-8 px-2.5 rounded-lg font-bold border ${gekozen ? "bg-accent text-white border-accent" : "bg-white text-[#3B3F4C] border-line hover:border-accent"}`}>
              {g}
            </button>
          );
        })}
      </div>
    );

  const actief = actieveVakken.find((v) => v.naam === gekozenVak) ?? null;
  const kies = (naam: string | null) => {
    setGekozenVak(naam);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const zijbalk = (
    <nav aria-label="Vakken" className="lg:sticky lg:top-6 w-full lg:w-60 shrink-0 bg-white border border-line rounded-[20px] p-2 flex lg:flex-col gap-1 overflow-x-auto">
      <button type="button" onClick={() => kies(null)} aria-current={!actief ? "page" : undefined} className={`flex items-center gap-2.5 min-h-11 px-3 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 ${!actief ? "bg-[#EEF0FF] text-[#3730A3]" : "text-[#3B3F4C] hover:bg-ground"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        Overzicht
      </button>
      <div className="hidden lg:block text-[11px] font-bold uppercase tracking-wider text-muted px-3 pt-3 pb-1">Mijn vakken</div>
      {[...actieveVakken].sort((a, b) => a.naam.localeCompare(b.naam)).map((v) => {
        const isActief = actief?.naam === v.naam;
        return (
          <button key={v.naam} type="button" onClick={() => kies(v.naam)} aria-current={isActief ? "page" : undefined} className={`flex items-center gap-2.5 min-h-11 px-3 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 text-left ${isActief ? "bg-[#EEF0FF] text-[#3730A3] font-bold" : "text-[#3B3F4C] hover:bg-ground"}`}>
            <span className="size-2.5 rounded-full shrink-0" style={{ background: v.kleur }} />
            <span className="grow truncate">{v.naam}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {zijbalk}
      <div className="grow min-w-0 w-full flex flex-col gap-7">
      {actief ? (
        <VakDetail
          vak={actief}
          items={alles.filter((i) => i.vak === actief.naam)}
          zonderDatum={zonderDatum.filter((t) => t.vak === actief.naam)}
          afgevinkt={afgevinkt}
          toggle={toggleAfgevinkt}
          groepKiezer={groepKiezer(actief)}
        />
      ) : (
      <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted mb-1">{new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-[32px] font-extrabold tracking-tight leading-tight">
            Komende 2 weken: {binnen2weken.toetsen} {binnen2weken.toetsen === 1 ? "toets" : "toetsen"} en {binnen2weken.taken} {binnen2weken.taken === 1 ? "taak" : "taken"}
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


      <div className="flex flex-wrap gap-5">
        {eerste ? (
          <section aria-label="Eerstvolgende taak" className="flex-[999_1_560px] min-w-0 rounded-3xl bg-ink text-white p-7 flex flex-wrap gap-7">
            <div className="flex-[1_1_220px] flex flex-col gap-3.5">
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-full bg-[#2A2D36] text-xs font-bold tracking-wider uppercase text-[#C7CAD6]">Eerstvolgende taak</span>
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${eerste.soort === "toets" ? "bg-[#FFEDD5] text-[#9A3412]" : "bg-[#E0E7FF] text-[#3730A3]"}`}>{eerste.type}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="size-3 rounded-full" style={{ background: eerste.kleur }} />
                <span className="text-[15px] font-bold text-[#E4E6EE]">{eerste.vak}{eerste.groep ? ` · ${eerste.groep}` : ""}</span>
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
              {eerste.soort === "toets" ? (
                <>
                  {eerste.stof && <Blok label="Stof">{eerste.stof}</Blok>}
                  {eerste.waar && <Blok label="Waar te vinden">{eerste.waar}</Blok>}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#A9ADBC] mb-2">Wat je moet doen</div>
                    <div className="flex flex-col gap-2">
                      {eerste.taken.map((taak) => {
                        const id = `${eerste.id}|${taak}`;
                        return (
                          <label key={id} className="flex items-center gap-2.5 text-sm text-[#F2F3F7] cursor-pointer min-h-7">
                            <input type="checkbox" checked={afgevinkt.includes(id)} onChange={() => toggleAfgevinkt(id)} className="size-[18px] accent-[#818CF8]" />
                            <span className={afgevinkt.includes(id) ? "line-through text-[#A9ADBC]" : ""}>{taak}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Blok label={eerste.type}>{eerste.titel}</Blok>
                  {eerste.omschrijving && <Blok label="Onderwerp">{eerste.omschrijving}</Blok>}
                  <label className="flex items-center gap-2.5 text-sm text-[#F2F3F7] cursor-pointer min-h-11 mt-auto">
                    <input type="checkbox" checked={false} onChange={() => toggleAfgevinkt(eerste.id)} className="size-[18px] accent-[#818CF8]" />
                    Klaar? Vink af, dan zie je de volgende taak
                  </label>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="flex-[999_1_560px] rounded-3xl bg-ink text-white p-7">
            <h2 className="text-2xl font-extrabold">Niets meer te doen</h2>
            <p className="text-[#C7CAD6] mt-2">Er staan geen toetsen of taken meer in je DSW voor je vakken.</p>
          </section>
        )}

        <section aria-label="Komende toetsen" className="flex-[1_1_320px] rounded-3xl bg-white border border-line p-5.5 flex flex-col gap-1.5">
          <h2 className="text-[17px] font-extrabold mb-2">Komende toetsen</h2>
          {toetsen.length === 0 && zonderDatum.length === 0 && <p className="text-sm text-muted">Geen toetsen gevonden voor jouw vakken.</p>}
          {toetsen.slice(0, alleToetsen ? undefined : 1).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 px-1 border-b border-[#F0F1F5] last:border-0">
              <span className="size-2.5 rounded-full shrink-0" style={{ background: t.kleur }} />
              <div className="grow min-w-0">
                <div className="text-sm font-bold">{t.vak}</div>
                <div className="text-[13px] text-muted truncate">{t.type} · {t.titel} · {datumKort(t.datum)}</div>
              </div>
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${t.dagen <= 3 ? "bg-[#FFEDD5] text-[#9A3412]" : t.dagen <= 7 ? "bg-[#EEF0FF] text-[#3730A3]" : "bg-[#F2F3F7] text-[#3B3F4C]"}`}>
                {overLabel(t.dagen)}
              </span>
            </div>
          ))}
          {(alleToetsen ? zonderDatum : zonderDatum.slice(0, Math.max(0, 1 - toetsen.length))).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 px-1 border-b border-[#F0F1F5] last:border-0">
              <span className="size-2.5 rounded-full shrink-0" style={{ background: t.kleur }} />
              <div className="grow min-w-0">
                <div className="text-sm font-bold">{t.vak}</div>
                <div className="text-[13px] text-muted truncate">{t.type} · {t.titel}</div>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold bg-[#F2F3F7] text-muted">{/toetsweek/i.test(`${t.stof} ${t.titel}`) ? "toetsweek" : "datum volgt"}</span>
            </div>
          ))}
          {toetsen.length + zonderDatum.length > 1 && (
            <button type="button" aria-expanded={alleToetsen} onClick={() => setAlleToetsen((x) => !x)} className="mt-1 self-start flex items-center gap-1.5 min-h-10 px-3 rounded-xl text-[13px] font-bold text-[#4338CA] hover:bg-[#EEF0FF]">
              {alleToetsen ? "Minder tonen" : `Alle ${toetsen.length + zonderDatum.length} toetsen tonen`}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={alleToetsen ? "rotate-180" : ""}><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
        </section>
      </div>

      {vakkenSectie}

      <section aria-label="Per vak" className="grid gap-4.5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {actieveVakken.map((v) => {
          const t = v.toets;
          const openTaken = v.taken;
          const toonAlles = open[v.naam];
          const zichtbaar = toonAlles ? openTaken : openTaken.slice(0, 4);
          return (
            <article key={v.naam} className="bg-white border border-line rounded-[20px] overflow-hidden flex flex-col">
              <div className="h-1.5" style={{ background: v.kleur }} />
              <div className="p-5 flex flex-col gap-3.5 grow">
                <div className="flex items-center justify-between gap-2.5">
                  <h3 className="text-lg font-extrabold">
                    <button type="button" onClick={() => kies(v.naam)} className="hover:underline text-left">{v.naam}</button>
                  </h3>
                  {t?.weging && <span className="px-2.5 py-1 rounded-full bg-[#F2F3F7] text-xs font-bold text-[#3B3F4C]">weegt {t.weging}</span>}
                </div>

                {groepKiezer(v)}

                {t ? (
                  <>
                    <div className="flex items-center gap-3.5 px-3.5 py-3 rounded-2xl bg-[#F7F8FB]">
                      <div className="flex flex-col items-center min-w-12">
                        <span className="text-[26px] font-extrabold leading-none tracking-tight">{t.dagen}</span>
                        <span className="text-[11px] font-bold text-muted">{dagWoord(t.dagen)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{t.titel}</div>
                        <div className="text-[13px] text-muted">{t.type} · {datumLang(t.datum)}</div>
                      </div>
                    </div>
                    {t.stof && t.stof !== t.titel && <Regel icoon="boek"><strong>Stof:</strong> {t.stof}</Regel>}
                    {t.waar && <Regel icoon="pin">{t.waar}</Regel>}
                  </>
                ) : (
                  <p className="text-sm text-muted">Geen toetsen gepland.</p>
                )}

                {zichtbaar.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted">Taken</div>
                    {zichtbaar.map((o) => {
                      const klaar = afgevinkt.includes(o.id);
                      return (
                        <label key={o.id} className="flex items-start gap-2.5 px-3 py-2 rounded-xl border border-dashed border-[#C9CCD8] text-[13px] text-[#3B3F4C] cursor-pointer">
                          <input type="checkbox" checked={klaar} onChange={() => toggleAfgevinkt(o.id)} className="size-4 mt-0.5 accent-[#4F46E5] shrink-0" />
                          <span className={`grow ${klaar ? "line-through text-muted" : ""}`}>
                            <span className="font-bold">{o.type}:</span> {o.titel}
                          </span>
                          <strong className="shrink-0">{datumKort(o.datum)}</strong>
                        </label>
                      );
                    })}
                    {openTaken.length > 4 && (
                      <button type="button" onClick={() => setOpen((x) => ({ ...x, [v.naam]: !toonAlles }))} className="self-start min-h-9 text-[13px] font-bold text-[#4338CA]">
                        {toonAlles ? "Minder tonen" : `Nog ${openTaken.length - 4} taken tonen`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>
      </>
      )}
      </div>
    </div>
  );
}

function VakDetail({ vak, items, zonderDatum, afgevinkt, toggle, groepKiezer }: { vak: { naam: string; kleur: string }; items: Item[]; zonderDatum: ReturnType<typeof toetsenZonderDatum>; afgevinkt: string[]; toggle: (id: string) => void; groepKiezer: React.ReactNode }) {
  const toetsen: (Omit<Item, "dagen" | "datum"> & { dagen: number | null; datum: string | null })[] = [
    ...items.filter((i) => i.soort === "toets"),
    ...zonderDatum.map((t) => ({ ...t, soort: "toets" as const, dagen: null, groep: t.groep ?? null, omschrijving: null })),
  ];
  const taken = items.filter((i) => i.soort === "taak");
  const open = taken.filter((t) => !afgevinkt.includes(t.id));
  return (
    <>
      <section className="bg-white border border-line rounded-3xl overflow-hidden">
        <div className="h-2" style={{ background: vak.kleur }} />
        <div className="p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="size-4 rounded-full" style={{ background: vak.kleur }} />
            <h1 className="text-[30px] font-extrabold tracking-tight leading-tight">{vak.naam}</h1>
          </div>
          <p className="text-muted text-sm">
            {toetsen.length} {toetsen.length === 1 ? "toets" : "toetsen"} en {open.length} open {open.length === 1 ? "taak" : "taken"}
          </p>
          {groepKiezer}
        </div>
      </section>

      <section aria-labelledby="vak-toetsen" className="flex flex-col gap-3.5">
        <h2 id="vak-toetsen" className="text-xl font-extrabold">Toetsen</h2>
        {toetsen.length === 0 && <p className="text-sm text-muted">Geen schoolexamens gevonden voor dit vak.</p>}
        {toetsen.map((t) => (
          <article key={t.id} className="bg-white border border-line rounded-[20px] p-5 flex flex-wrap gap-5">
            <div className={`flex flex-col items-center justify-center rounded-2xl min-w-[88px] px-3 py-3 ${t.dagen !== null && t.dagen <= 3 ? "bg-[#FFEDD5] text-[#9A3412]" : "bg-[#F7F8FB]"}`}>
              <span className="text-[36px] font-extrabold leading-none tracking-tight">{t.dagen ?? "?"}</span>
              <span className="text-xs font-bold">{t.dagen === null ? "datum volgt" : t.dagen === 0 ? "vandaag" : dagWoord(t.dagen)}</span>
            </div>
            <div className="flex-[1_1_240px] min-w-0 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-[#FFEDD5] text-[#9A3412] text-xs font-bold">{t.type}</span>
                {t.weging && <span className="px-2.5 py-1 rounded-full bg-[#F2F3F7] text-xs font-bold text-[#3B3F4C]">weegt {t.weging}</span>}
                {t.groep && <span className="px-2.5 py-1 rounded-full bg-[#F2F3F7] text-xs font-bold text-[#3B3F4C]">{t.groep}</span>}
              </div>
              <h3 className="text-lg font-extrabold leading-snug">{t.titel}</h3>
              <div className="text-[13px] text-muted">{t.datum ? datumLang(t.datum) : /toetsweek/i.test(`${t.stof} ${t.titel}`) ? "In de toetsweek, precieze dag volgt" : "Datum staat nog niet in de DSW"}</div>
              {t.stof && t.stof !== t.titel && <Regel icoon="boek"><strong>Stof:</strong> {t.stof}</Regel>}
              {t.waar && <Regel icoon="pin">{t.waar}</Regel>}
              {t.taken.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">Wat je moet doen</div>
                  {t.taken.map((taak) => {
                    const id = `${t.id}|${taak}`;
                    const klaar = afgevinkt.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2.5 text-sm cursor-pointer min-h-8">
                        <input type="checkbox" checked={klaar} onChange={() => toggle(id)} className="size-4 accent-[#4F46E5]" />
                        <span className={klaar ? "line-through text-muted" : ""}>{taak}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="vak-taken" className="flex flex-col gap-3.5">
        <h2 id="vak-taken" className="text-xl font-extrabold">Taken</h2>
        {taken.length === 0 && <p className="text-sm text-muted">Geen taken gevonden voor dit vak.</p>}
        <div className="flex flex-col gap-2">
          {taken.map((o) => {
            const klaar = afgevinkt.includes(o.id);
            return (
              <label key={o.id} className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-white border border-line text-sm cursor-pointer">
                <input type="checkbox" checked={klaar} onChange={() => toggle(o.id)} className="size-[18px] mt-0.5 accent-[#4F46E5] shrink-0" />
                <span className={`grow min-w-0 ${klaar ? "line-through text-muted" : ""}`}>
                  <span className="px-2 py-0.5 mr-2 rounded-full bg-[#E0E7FF] text-[#3730A3] text-[11px] font-bold">{o.type}</span>
                  {o.titel}
                  {o.omschrijving && <span className="block text-[13px] text-muted mt-0.5">{o.omschrijving}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block">{datumKort(o.datum)}</strong>
                  <span className="text-xs text-muted">{overLabel(o.dagen)}</span>
                </span>
              </label>
            );
          })}
        </div>
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
