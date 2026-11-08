"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { slaNieuweDswOp } from "@/lib/store";

export default function Upload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [bestand, setBestand] = useState<File | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [sleep, setSleep] = useState(false);

  async function verstuur() {
    setBezig(true);
    setFout(null);
    const form = new FormData();
    if (bestand) form.append("file", bestand);
    else form.append("tekst", tekst);
    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Er ging iets mis.");
      slaNieuweDswOp(json.dsw, json.ingelezenOp);
      router.push("/");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Er ging iets mis.");
      setBezig(false);
    }
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight">DSW bijwerken</h1>
        <p className="text-muted mt-1">Upload de nieuwste versie. De AI leest alles uit en laat zien wat er is veranderd.</p>
      </div>

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
        <span className="text-sm text-muted">PDF of screenshot, max 20 MB</span>
      </button>
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />

      <details className="rounded-2xl bg-white border border-line p-4">
        <summary className="cursor-pointer font-bold text-sm">Of plak de tekst van je DSW</summary>
        <label htmlFor="dsw-tekst" className="sr-only">DSW-tekst</label>
        <textarea id="dsw-tekst" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={8} className="mt-3 w-full rounded-xl border border-line p-3 text-sm" placeholder="Kopieer de DSW uit Magister/SOM en plak hem hier" />
      </details>

      {fout && <p role="alert" className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] px-4 py-3 text-sm">{fout}</p>}

      <button
        type="button"
        disabled={bezig || (!bestand && !tekst.trim())}
        onClick={verstuur}
        className="self-start min-h-12 px-6 rounded-xl bg-accent text-white font-bold disabled:opacity-50 hover:bg-[#4338CA]"
      >
        {bezig ? "De AI leest je DSW… (±30 sec)" : "Uitlezen"}
      </button>
      <p className="text-xs text-muted">Je DSW wordt alleen naar de AI gestuurd om uit te lezen. Het resultaat blijft in jouw browser.</p>
    </div>
  );
}
