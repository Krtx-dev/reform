"use client";

import { useMemo } from "react";
import { formatLength, fromMm, mm2ToM2, type LengthUnit } from "@/core/domain/units";
import { useWorkspace } from "@/stores/workspace";

export function useFormat() {
  const unit = useWorkspace((s) => s.prefs.unit);
  const currency = useWorkspace((s) => s.prefs.currency);
  return useMemo(() => makeFormat(unit, currency), [unit, currency]);
}

export function makeFormat(unit: LengthUnit, currency: string) {
  return {
    unit,
    currency,
    len: (mm: number) => formatLength(mm, unit),
    lenNum: (mm: number) => {
      const v = fromMm(mm, unit);
      return unit === "mm" ? String(Math.round(v)) : unit === "cm" ? v.toFixed(1) : v.toFixed(3);
    },
    dims: (w: number, h: number) => {
      const f = (mm: number) => {
        const v = fromMm(mm, unit);
        return unit === "mm" ? String(Math.round(v)) : unit === "cm" ? v.toFixed(1) : v.toFixed(3);
      };
      return `${f(w)} × ${f(h)} ${unit}`;
    },
    area: (mm2: number, d = 2) => `${mm2ToM2(mm2).toFixed(d)} m²`,
    m2: (mm2: number, d = 2) => mm2ToM2(mm2).toFixed(d),
    pct: (f: number, d = 1) => (Number.isFinite(f) ? `${(f * 100).toFixed(d)}%` : "—"),
    money: (v: number | null | undefined, d = 2) => (v == null ? "—" : `${currency}${v.toFixed(d)}`),
    kg: (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v.toFixed(d)} kg`),
    ms: (v: number) => (v < 1000 ? `${v.toFixed(0)} ms` : `${(v / 1000).toFixed(2)} s`),
  };
}

export type Format = ReturnType<typeof makeFormat>;

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}
