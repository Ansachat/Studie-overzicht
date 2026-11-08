"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dsw } from "./schema";

// MVP: alles blijft lokaal in de browser van de leerling.
// Geen account nodig, en geen schooldata op een server.
export type Opgeslagen = {
  dsw: Dsw;
  ingelezenOp: string;
  link?: string;
  vorige?: Dsw;
  uitgezet: string[];
  afgevinkt: string[];
};

const KEY = "studie-overzicht:v1";

function lees(): Opgeslagen | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Opgeslagen) : null;
  } catch {
    return null;
  }
}

function schrijf(data: Opgeslagen | null) {
  try {
    if (data) localStorage.setItem(KEY, JSON.stringify(data));
    else localStorage.removeItem(KEY);
  } catch {
    /* opslag geblokkeerd: werkt dan alleen deze sessie */
  }
}

export function useOpslag() {
  const [data, setData] = useState<Opgeslagen | null>(null);
  const [klaar, setKlaar] = useState(false);

  useEffect(() => {
    setData(lees());
    setKlaar(true);
  }, []);

  const update = useCallback((fn: (d: Opgeslagen | null) => Opgeslagen | null) => {
    setData((oud) => {
      const nieuw = fn(oud);
      schrijf(nieuw);
      return nieuw;
    });
  }, []);

  const herlaad = useCallback(() => setData(lees()), []);

  return { data, klaar, update, herlaad };
}

// link: string = koppelen, null = ontkoppelen, undefined = laten zoals het was
export function slaNieuweDswOp(dsw: Dsw, ingelezenOp: string, link?: string | null) {
  const oud = lees();
  schrijf({
    dsw,
    ingelezenOp,
    link: link === undefined ? oud?.link : link ?? undefined,
    vorige: oud?.dsw,
    // Eerste keer met veel vakken (alle klassen in één DSW): alles uit, leerling kiest zelf.
    // Daarna: vakken die nieuw in de DSW verschijnen ook uit, zodat je overzicht niet volloopt.
    uitgezet: oud
      ? [...oud.uitgezet, ...dsw.vakken.map((v) => v.naam).filter((n) => !oud.dsw.vakken.some((o) => o.naam === n) && oud.dsw.vakken.length > 12)]
      : dsw.vakken.length > 12
        ? dsw.vakken.map((v) => v.naam)
        : [],
    afgevinkt: oud?.afgevinkt ?? [],
  });
}

// Na zoveel dagen leest het platform een gekoppelde link vanzelf opnieuw in.
export const VERNIEUW_NA_DAGEN = 3;

export async function leesDswIn(form: FormData): Promise<{ dsw: Dsw; ingelezenOp: string }> {
  const res = await fetch("/api/extract", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Er ging iets mis.");
  return json;
}

export async function vernieuwViaLink(link: string) {
  const form = new FormData();
  form.append("link", link);
  const { dsw, ingelezenOp } = await leesDswIn(form);
  slaNieuweDswOp(dsw, ingelezenOp, link);
}
