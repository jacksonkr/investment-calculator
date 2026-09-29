"use client";

import { useEffect, useState } from "react";
import type { PriceHistory } from "@/lib/history";

export type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; history: PriceHistory };

type Loaded = { symbol: string; history?: PriceHistory; message?: string };

/** Loads the price history for a symbol; pass null to load nothing. */
export function useHistory(symbol: string | null): HistoryState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        setLoaded(
          response.ok
            ? { symbol, history: body as PriceHistory }
            : { symbol, message: body.error ?? "Something went wrong." },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ symbol, message: "Couldn't reach the server. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (!symbol) return { status: "idle" };
  if (loaded?.symbol !== symbol) return { status: "loading" };
  if (loaded.history) return { status: "ready", history: loaded.history };
  return { status: "error", message: loaded.message ?? "Something went wrong." };
}
