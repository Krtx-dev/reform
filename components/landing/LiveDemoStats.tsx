"use client";

import { useEffect, useState } from "react";
import type { OptimizationResult } from "@/core/domain/types";
import { optimize } from "@/core/optimization/engine";
import { DEMO_CONSTRAINTS, DEMO_INVENTORY } from "@/data/demo/inventory";
import { DEMO_DEMAND, DEMO_PRODUCTS } from "@/data/demo/products";

/** Runs the baseline and MaxRects on the synthetic demo dataset in the visitor's browser. */
export function LiveDemoStats() {
  const [res, setRes] = useState<{ shelf: OptimizationResult; maxrects: OptimizationResult } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const base = { remnants: DEMO_INVENTORY, products: DEMO_PRODUCTS, demand: DEMO_DEMAND, constraints: DEMO_CONSTRAINTS, objective: "material" as const, heuristic: "bssf" as const, search: { seed: 42, timeLimitMs: 1000, maxIterations: 1 } };
      setRes({ shelf: optimize({ ...base, algorithm: "shelf" }), maxrects: optimize({ ...base, algorithm: "maxrects" }) });
    }, 50);
    return () => clearTimeout(t);
  }, []);
  const total = DEMO_INVENTORY.reduce((s, r) => s + r.width * r.height * r.quantity, 0);
  const cells: [string, string, string][] = res
    ? [
        ["Synthetic inventory", `${(total / 1e6).toFixed(2)} m²`, `${DEMO_INVENTORY.reduce((s, r) => s + r.quantity, 0)} remnants, ${DEMO_INVENTORY.filter((r) => r.defects.length).reduce((s, r) => s + r.quantity, 0)} with defects`],
        ["Shelf baseline", `${(res.shelf.metrics.utilization * 100).toFixed(1)}%`, `${res.shelf.metrics.productsCompleted} complete products`],
        ["MaxRects (single pass)", `${(res.maxrects.metrics.utilization * 100).toFixed(1)}%`, `${res.maxrects.metrics.productsCompleted} complete products`],
        ["Allocated by MaxRects", `${(res.maxrects.metrics.usedCutArea / 1e6).toFixed(2)} m²`, `≈ ${res.maxrects.metrics.allocatedMassKg?.toFixed(2)} kg from per-fabric GSM`],
      ]
    : [];
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-line bg-surface divide-x divide-line rounded-[3px]" aria-live="polite">
        {res
          ? cells.map(([k, v, s]) => (
              <div key={k} className="p-5">
                <div className="label-caps">{k}</div>
                <div className="num text-[30px] tracking-tight mt-1">{v}</div>
                <div className="text-[12px] text-muted">{s}</div>
              </div>
            ))
          : <div className="p-5 text-[13px] text-muted col-span-4">Computing in your browser…</div>}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">Computed on page load from the explicitly synthetic demonstration dataset. The multi-strategy search, which improves further, runs in the workspace in a Web Worker. These are algorithm results on invented data, not measured real-world recovery.</p>
    </div>
  );
}
