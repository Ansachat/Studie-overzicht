"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { leesDswIn, slaNieuweDswOp, VERNIEUW_NA_DAGEN } from "@/lib/store";

type Manier = "link" | "bestand" | "tekst";

export default function Upload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [manier, setManier] = useState<Manier>("link");
  const [link, setLink] = useState("");
  const [bestand, setBestand] = useState<File | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [sleep, setSleep] = useState(false);

  const linkOk = /^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(link.trim());
  const kanVersturen = manier === "link" ? linkOk : manier === "bestand" ? !!bestand : !!tekst.trim();

  async function verstuur() {
    setBezig(true);
    setFout(null);
    const form = new FormData();
    if (manier === "link") form.append("link", link.trim());
    else if (manier === "bestand" && bestand) form.append("file", bestand);
    else form.append("tekst", tekst);
    try {
      const { dsw, ingelezenOp } = await leesDswIn(form);
      slaNieuweDswOp(dsw, ingelezenOp, manier === "link" ? link.trim() : null);
      router.push("/");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Er ging iets mis.");
      setBezig(false);
    }
  }

  const tab = (m: Manier, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={manier === m}
      onClick={() => setManier(m)}
      className={`min-h-11 px-4 rounded-xl text-sm font-bold ${manier === m ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight">DSW toevoegen</h1>
        <p className="text-muted mt-1">De AI leest alles uit en laat zien wat er is veranderd sinds de vorige keer.</p>
      </div>

      <div role="tablist" aria-label="Hoe wil je je DSW toevoegen?" className="flex flex-wrap gap-1 p-1 rounded-2xl bg-[#EDEEF2] self-start">
        {tab("link", "Link plakken")}
        {tab("bestand", "Bestand uploaden")}
        {tab("tekst", "Tekst plakken")}
      </div>

      {manier === "link" && (
        <div className="rounded-3xl bg-white border border-line p-6 flex flex-col gap-3">
          <label htmlFor="dsw-link" className="font-bold">Link naar je DSW (Google Sheets)</label>
          <input
            id="dsw-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="min-h-12 px-4 rounded-xl border border-line text-sm"
          />
          <div className="flex gap-2.5 items-start text-sm text-[#3B3F4C] bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-3.5 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
            <span>Met een link hoef je nooit meer te uploaden: als je DSW ouder is dan {VERNIEUW_NA_DAGEN} dagen, leest het platform hem vanzelf opnieuw in.</span>
          </div>
          {link.trim() && !linkOk && <p className="text-sm text-[#991B1B]">Dit lijkt geen Google Sheets-link. Gebruik de link uit de adresbalk van je DSW.</p>}
        </div>
      )}

      {manier === "bestand" && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSleep(true);
            }}
            onDragLeave={() => setSleep(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSleep(false);
              const f = e.dataTransfer.files[0];
              if (f) setBestand(f);
            }}
            className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center gap-3 text-center transition ${sleep ? "border-accent bg-[#EEF0FF]" : "border-[#C9CCD8] bg-white hover:border-accent"}`}
          >
            <span className="size-14 rounded-2xl bg-[#EEF0FF] grid place-items-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
            </span>
            <span className="text-lg font-bold">{bestand ? bestand.name : "Sleep je DSW hierheen of klik om te kiezen"}</span>
            <span className="text-sm text-muted">PDF, Excel of screenshot, max 20 MB</span>
          </button>
          <input ref={input} type="file" accept="application/pdf,image/*,.xlsx" className="hidden" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
        </>
      )}

      {manier === "tekst" && (
        <div className="rounded-3xl bg-white border border-line p-6">
          <label htmlFor="dsw-tekst" className="font-bold">Plak de tekst van je DSW</label>
          <textarea id="dsw-tekst" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={8} className="mt-3 w-full rounded-xl border border-line p-3 text-sm" />
        </div>
      )}

      {fout && <p role="alert" className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] px-4 py-3 text-sm">{fout}</p>}

      <button
        type="button"
        disabled={bezig || !kanVersturen}
        onClick={verstuur}
        className="self-start min-h-12 px-6 rounded-xl bg-accent text-white font-bold disabled:opacity-50 hover:bg-[#4338CA]"
      >
        {bezig ? "De AI leest je DSW… (±30 sec)" : "Uitlezen"}
      </button>
      <p className="text-xs text-muted">Je DSW wordt alleen naar de AI gestuurd om uit te lezen. Het resultaat blijft in jouw browser.</p>
    </div>
  );
}
