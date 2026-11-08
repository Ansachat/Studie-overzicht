"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

// Inloggen + opslag in de cloud (Supabase). Staat alleen aan als de twee
// NEXT_PUBLIC_SUPABASE_*-variabelen zijn ingesteld; anders werkt alles gewoon lokaal.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudAan = !!(URL && KEY);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!cloudAan) return null;
  client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

// Welke localStorage-sleutels meegaan naar de cloud.
export const SYNC_SLEUTELS = ["studie-overzicht:v1", "studie-overzicht:plan:v1", "studie-overzicht:momenten:v1", "studie-overzicht:weekdoelen:v1", "studie-overzicht:gedaan:v1"];
export const SYNC_EVENT = "studie-overzicht:gesynct";

const tsKey = (k: string) => `studie-overzicht:ts:${k}`;

function lokaleTijd(k: string) {
  try {
    return Number(localStorage.getItem(tsKey(k)) ?? 0);
  } catch {
    return 0;
  }
}

/** Schrijf naar localStorage én (als je bent ingelogd) naar de cloud. */
export function bewaar(sleutel: string, waarde: unknown | null) {
  const nu = Date.now();
  try {
    if (waarde === null) localStorage.removeItem(sleutel);
    else localStorage.setItem(sleutel, JSON.stringify(waarde));
    localStorage.setItem(tsKey(sleutel), String(nu));
  } catch {
    /* opslag geblokkeerd */
  }
  if (SYNC_SLEUTELS.includes(sleutel)) planUpload(sleutel);
}

const wachtrij = new Map<string, ReturnType<typeof setTimeout>>();
function planUpload(sleutel: string) {
  const sb = supabase();
  if (!sb) return;
  clearTimeout(wachtrij.get(sleutel));
  wachtrij.set(
    sleutel,
    setTimeout(() => {
      void upload(sleutel);
    }, 800),
  );
}

async function upload(sleutel: string) {
  const sb = supabase();
  if (!sb) return;
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(sleutel);
  } catch {
    return;
  }
  if (raw === null) {
    await sb.from("gebruikersdata").delete().eq("user_id", data.user.id).eq("sleutel", sleutel);
    return;
  }
  await sb.from("gebruikersdata").upsert({
    user_id: data.user.id,
    sleutel,
    waarde: JSON.parse(raw),
    bijgewerkt: new Date(lokaleTijd(sleutel) || Date.now()).toISOString(),
  });
}

/** Na inloggen: nieuwste versie wint, per sleutel. */
export async function synchroniseer() {
  const sb = supabase();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { data, error } = await sb.from("gebruikersdata").select("sleutel, waarde, bijgewerkt");
  if (error) return;
  const opDeServer = new Map((data ?? []).map((r) => [r.sleutel as string, r]));
  let veranderd = false;
  for (const k of SYNC_SLEUTELS) {
    const r = opDeServer.get(k);
    const lokaal = lokaleTijd(k);
    const lokaalHeeft = (() => {
      try {
        return localStorage.getItem(k) !== null;
      } catch {
        return false;
      }
    })();
    if (r && (!lokaalHeeft || new Date(r.bijgewerkt as string).getTime() > lokaal)) {
      try {
        localStorage.setItem(k, JSON.stringify(r.waarde));
        localStorage.setItem(tsKey(k), String(new Date(r.bijgewerkt as string).getTime()));
        veranderd = true;
      } catch {
        /* */
      }
    } else if (lokaalHeeft && (!r || lokaal > new Date(r.bijgewerkt as string).getTime())) {
      await upload(k);
    }
  }
  if (veranderd) window.dispatchEvent(new Event(SYNC_EVENT));
}

export function useGebruiker() {
  const [gebruiker, setGebruiker] = useState<User | null>(null);
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => {
      setGebruiker(data.user);
      if (data.user) void synchroniseer();
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, sessie) => {
      setGebruiker(sessie?.user ?? null);
      if (event === "SIGNED_IN") void synchroniseer();
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return gebruiker;
}

export async function stuurInloglink(email: string) {
  const sb = supabase();
  if (!sb) throw new Error("Inloggen staat nog niet aan.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(error.message);
}

export async function uitloggen() {
  await supabase()?.auth.signOut();
}
