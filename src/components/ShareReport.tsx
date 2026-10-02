"use client";

import { useState } from "react";
import { NATIVE } from "@/lib/native";
import { shareReport, type Report } from "@/lib/report";

type Status = "idle" | "working" | "downloaded" | "failed";

const LABELS: Record<Status, string> = {
  idle: "Share this report",
  working: "Preparing…",
  downloaded: "Image downloaded",
  failed: "Couldn't share. Try again",
};

/** Shares the results as an image with a short message. */
export function ShareReport({ report }: { report: () => Report }) {
  const [status, setStatus] = useState<Status>("idle");

  return (
    <button
      type="button"
      disabled={status === "working"}
      onClick={async () => {
        setStatus("working");
        try {
          // The web version can link back to the same scenario.
          const link = NATIVE ? undefined : window.location.href;
          const result = await shareReport(report(), link);
          setStatus(result === "downloaded" ? "downloaded" : "idle");
        } catch {
          setStatus("failed");
        }
        setTimeout(() => setStatus((current) => (current === "working" ? current : "idle")), 2500);
      }}
      className="inline-flex items-center gap-2 rounded-md bg-growth px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13V3M6 6.5 10 3l4 3.5M5 10H4.5A1.5 1.5 0 0 0 3 11.5v4A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-4a1.5 1.5 0 0 0-1.5-1.5H15" />
      </svg>
      {LABELS[status]}
    </button>
  );
}
