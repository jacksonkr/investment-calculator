"use client";

import { useEffect, useState } from "react";
import type { PriceHistory } from "@/lib/history";
import { lookupHistory } from "@/lib/lookup";
import { NATIVE } from "@/lib/native";

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
    // The native apps have no server behind them, so they look the symbol up themselves.
    const lookup = NATIVE
      ? lookupHistory(symbol).then(({ status, body }) => ({ ok: status === 200, body }))
      : fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`).then(async (response) => ({
          ok: response.ok,
          body: await response.json(),
        }));
    lookup
      .then(({ ok, body }) => {
        if (cancelled) return;
        setLoaded(
          ok
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
