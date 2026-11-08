"use client";

import Link from "next/link";
import { useState } from "react";
import { cloudAan, stuurInloglink, uitloggen, useGebruiker } from "@/lib/cloud";

export default function Login() {
  const gebruiker = useGebruiker();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"invullen" | "bezig" | "verstuurd">("invullen");
  const [fout, setFout] = useState<string | null>(null);

  if (!cloudAan) {
    return (
      <section className="rounded-3xl bg-white border border-line p-8 max-w-xl flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold">Inloggen komt eraan</h1>
        <p className="text-muted">Je gegevens worden nu op dit apparaat bewaard. Zodra inloggen aanstaat, kun je ze op al je apparaten gebruiken.</p>
        <Link href="/" className="self-start min-h-11 px-5 rounded-xl bg-accent text-white font-bold grid place-items-center">Terug naar home</Link>
      </section>
    );
  }

  if (gebruiker) {
    return (
      <section className="rounded-3xl bg-white border border-line p-8 max-w-xl flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold">Je bent ingelogd</h1>
        <p className="text-muted">Als <strong className="text-ink">{gebruiker.email}</strong>. Je DSW, vakken, afgevinkte taken en planning worden automatisch bewaard.</p>
        <div className="flex gap-2">
          <Link href="/" className="min-h-11 px-5 rounded-xl bg-accent text-white font-bold grid place-items-center">Naar je overzicht</Link>
          <button onClick={() => void uitloggen()} className="min-h-11 px-5 rounded-xl border border-line font-bold hover:bg-ground">Uitloggen</button>
        </div>
      </section>
    );
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setStatus("bezig");
    try {
      await stuurInloglink(email.trim());
      setStatus("verstuurd");
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er ging iets mis.");
      setStatus("invullen");
    }
  }

  return (
    <section className="rounded-3xl bg-white border border-line p-8 max-w-xl flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Inloggen</h1>
      {status === "verstuurd" ? (
        <p className="text-muted">Check je mail! We hebben een inloglink gestuurd naar <strong className="text-ink">{email}</strong>. Klik erop en je bent binnen.</p>
      ) : (
        <form onSubmit={verstuur} className="flex flex-col gap-3">
          <p className="text-muted">Geen wachtwoord nodig. Vul je e-mail in en je krijgt een inloglink. Daarna staan je gegevens op al je apparaten.</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            E-mailadres
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" className="min-h-11 px-3.5 rounded-xl border border-line text-base font-normal" />
          </label>
          {fout && <p className="text-sm text-red-700">{fout}</p>}
          <button disabled={status === "bezig"} className="self-start min-h-11 px-5 rounded-xl bg-accent text-white font-bold disabled:opacity-60">
            {status === "bezig" ? "Versturen…" : "Stuur inloglink"}
          </button>
        </form>
      )}
    </section>
  );
}
