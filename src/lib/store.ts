"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dsw } from "./schema";

// MVP: alles blijft lokaal in de browser van de leerling.
// Geen account nodig, en geen schooldata op een server.
export type Opgeslagen = {
  dsw: Dsw;
  ingelezenOp: string;
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

  return { data, klaar, update };
}

export function slaNieuweDswOp(dsw: Dsw, ingelezenOp: string) {
  const oud = lees();
  schrijf({
    dsw,
    ingelezenOp,
    vorige: oud?.dsw,
    uitgezet: oud?.uitgezet ?? [],
    afgevinkt: oud?.afgevinkt ?? [],
  });
}
