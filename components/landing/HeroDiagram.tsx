"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { MaterialRemnant, ProductTemplate } from "@/core/domain/types";
import { optimize } from "@/core/optimization/engine";
import { productColorMap } from "@/components/canvas/layout";

/**
 * Hero illustration generated from REAL engine output: a fixed set of remnants and
 * products is packed by MaxRects in the browser; the "before" state scatters the same
 * pieces outside the material. GSAP tweens each piece between the two states.
 */
const rem = (id: string, w: number, h: number, color: string, defects: MaterialRemnant["defects"] = []): MaterialRemnant => ({
  id, name: id, fabricType: "cotton", color, colorName: "", width: w, height: h, condition: "good", quantity: 1, reserved: 0, consumed: 0, batchId: "", grain: "none", allowRotation: true, defects, location: "", notes: "", source: "demo", createdAt: 0,
});
const REMNANTS = [rem("A", 620, 420, "#d8cfb8", [{ x: 400, y: 260, w: 70, h: 60 }]), rem("B", 440, 300, "#2c3e5c"), rem("C", 360, 460, "#9fae8c"), rem("D", 300, 220, "#c4553e")];
const prod = (id: string, name: string, pieces: [number, number, number][], value: number): ProductTemplate => ({
  id, name, description: "", category: "", pieces: pieces.map(([w, h, q], i) => ({ id: `${id}${i}`, name: `${name} ${i}`, width: w, height: h, quantity: q, grain: "none", allowRotation: true })), seamAllowance: 0, allowedFabrics: ["cotton"], matchFabric: false, preferredColors: [], value, assemblyNotes: "", builtin: true, createdAt: 0,
});
const PRODUCTS = [prod("tote", "Tote", [[200, 230, 2], [60, 300, 2]], 28), prod("pouch", "Pouch", [[150, 190, 2]], 9), prod("coaster", "Coaster", [[100, 100, 2]], 3)];

const POS: Record<string, [number, number]> = { A: [20, 30], B: [700, 30], C: [700, 380], D: [20, 520] };

export function HeroDiagram() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<"before" | "after">("before");
  const result = useMemo(
    () =>
      optimize({
        remnants: REMNANTS,
        products: PRODUCTS,
        demand: [{ productId: "tote", max: 2, priority: false }, { productId: "pouch", max: 4, priority: false }, { productId: "coaster", max: 12, priority: false }],
        constraints: { clearance: 6, edgeMargin: 6, allowRotation: true, respectGrain: true },
        objective: "material",
        algorithm: "maxrects",
        heuristic: "bssf",
        search: { seed: 1, timeLimitMs: 1000, maxIterations: 1 },
      }),
    [],
  );
  const colors = useMemo(() => productColorMap(PRODUCTS.map((p) => p.id)), []);
  // deterministic scattered "before" positions in the strip below the material
  const scatter = useMemo(() => {
    let x = 1170, y = 40;
    return result.placements.map((p) => {
      const s = { x, y };
      y += p.h * 0.55 + 14;
      if (y > 720) { y = 40; x += 140; }
      return s;
    });
  }, [result]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = Array.from(svg.querySelectorAll<SVGGElement>("[data-piece]"));
    nodes.forEach((n, i) => {
      const p = result.placements[i];
      const [ox, oy] = POS[p.instanceId.split(":")[0]];
      const t = state === "after" ? { x: ox + p.x, y: oy + p.y, s: 1, r: 0 } : { x: scatter[i].x, y: scatter[i].y, s: 0.55, r: (i % 5) - 2 };
      const el = n as SVGGElement & { _pose?: { x: number; y: number; s: number; r: number } };
      const pose = el._pose ?? (el._pose = { x: scatter[i].x, y: scatter[i].y, s: 0.55, r: 0 });
      const write = () => n.setAttribute("transform", `translate(${pose.x} ${pose.y}) rotate(${pose.r}) scale(${pose.s})`);
      gsap.killTweensOf(pose);
      if (reduce) {
        Object.assign(pose, t);
        write();
      } else gsap.to(pose, { ...t, duration: 0.9, delay: (state === "after" ? p.seq : result.placements.length - p.seq) * 0.025, ease: "power3.inOut", onUpdate: write, onStart: write });
      write();
    });
  }, [state, result, scatter]);

  useEffect(() => {
    const t = setTimeout(() => setState("after"), 700);
    return () => clearTimeout(t);
  }, []);

  const m = result.metrics;
  return (
    <div className="relative">
      <svg ref={svgRef} viewBox="0 0 1460 760" className="w-full h-auto" role="img" aria-label={`Four fabric remnants. ${result.placements.length} pattern pieces for ${m.productsCompleted} products are packed into them, using ${(m.utilization * 100).toFixed(1)} percent of usable area.`}>
        <defs>
          <pattern id="hero-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#b94d44" strokeWidth="2" /></pattern>
        </defs>
        {REMNANTS.map((r) => {
          const [x, y] = POS[r.id];
          return (
            <g key={r.id} transform={`translate(${x} ${y})`}>
              <rect width={r.width} height={r.height} fill={r.color} opacity={0.28} stroke="var(--ink)" strokeWidth="1.5" />
              {r.defects.map((d, i) => <rect key={i} x={d.x} y={d.y} width={d.w} height={d.h} fill="url(#hero-hatch)" stroke="#b94d44" />)}
              <text x="0" y="-8" fontSize="13" fontFamily="var(--font-geist-mono)" fill="var(--muted)">{r.id} · {r.width}×{r.height} mm</text>
            </g>
          );
        })}
        <text x="1170" y="22" fontSize="13" fontFamily="var(--font-geist-mono)" fill="var(--muted)">{state === "before" ? "PATTERN PIECES · UNALLOCATED" : ""}</text>
        {result.placements.map((p) => (
          <g key={p.id} data-piece="">
            <rect width={p.w} height={p.h} fill={colors.get(p.productId)} stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Illustration state" className="inline-flex border border-line-strong rounded-[3px] p-0.5 bg-surface">
          {(["before", "after"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={state === s} onClick={() => setState(s)} className={`h-7 px-3 text-[12px] rounded-[2px] ${state === s ? "bg-ink text-bg" : "text-muted"}`}>{s === "before" ? "Remnants + pieces" : "Optimized"}</button>
          ))}
        </div>
        <span className="font-mono text-[11.5px] text-muted">
          computed live by the MaxRects engine · {m.productsCompleted} complete products · {(m.utilization * 100).toFixed(1)}% of usable area · {result.validation.valid ? "validated" : "INVALID"}
        </span>
      </div>
    </div>
  );
}
