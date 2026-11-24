"use client";

import { useState } from "react";
import { cn } from "@/lib/id";

export interface BarDatum {
  label: string;
  value: number;
  /** Optional second measure drawn as a light track behind the bar (e.g. available vs used). */
  total?: number;
  display: string;
  sub?: string;
}

/**
 * Horizontal bar list. One hue (magnitude), thin bars, track for the denominator,
 * direct labels, native hover tooltips, and an accessible table view toggle.
 */
export function BarList({ data, caption, emptyText = "No data yet.", trackLabel, valueLabel }: { data: BarDatum[]; caption: string; emptyText?: string; trackLabel?: string; valueLabel?: string }) {
  const [table, setTable] = useState(false);
  if (data.length === 0) return <p className="text-[12.5px] text-muted">{emptyText}</p>;
  const max = Math.max(...data.map((d) => d.total ?? d.value), 1e-9);
  return (
    <figure>
      <div className="flex items-center justify-between mb-2">
        <figcaption className="text-[11.5px] text-muted">{caption}</figcaption>
        <button className="text-[11px] text-primary hover:underline" onClick={() => setTable((v) => !v)} aria-pressed={table}>{table ? "Chart" : "Table"}</button>
      </div>
      {table ? (
        <table className="w-full text-[12px]">
          <thead className="text-muted text-[10.5px]"><tr><th className="text-left font-normal">Item</th>{trackLabel && <th className="text-right font-normal">{trackLabel}</th>}<th className="text-right font-normal">{valueLabel ?? "Value"}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label} className="border-t border-line/60"><td className="py-1">{d.label}</td>{trackLabel && <td className="text-right num">{d.total?.toFixed(3)}</td>}<td className="text-right num">{d.display}</td></tr>)}</tbody>
        </table>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((d) => (
            <li key={d.label} className="group" title={`${d.label}: ${d.display}${d.sub ? ` · ${d.sub}` : ""}`}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="truncate">{d.label}</span>
                <span className="num text-ink/80">{d.display}{d.sub && <span className="text-muted"> · {d.sub}</span>}</span>
              </div>
              <div className="relative mt-1 h-2.5">
                {d.total != null && <div className="absolute inset-y-0 left-0 bg-surface-2 border border-line rounded-r-[4px]" style={{ width: `${(d.total / max) * 100}%` }} />}
                <div className="absolute inset-y-0 left-0 bg-primary rounded-r-[4px] group-hover:brightness-125 transition-[width] duration-500" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Cumulative step line over time (one series). */
export function StepLine({ points, caption, format }: { points: { t: number; v: number; label: string }[]; caption: string; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="text-[12.5px] text-muted">No committed plans yet. Allocation over time is recorded when plans are committed.</p>;
  const W = 560, H = 160, P = 28;
  const t0 = points[0].t, t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const vmax = Math.max(...points.map((p) => p.v), 1e-9);
  const x = (t: number) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / vmax) * (H - 2 * P);
  let d = `M${x(t0)},${y(0)}`;
  for (const p of points) d += ` H${x(p.t)} V${y(p.v)}`;
  return (
    <figure>
      <figcaption className="text-[11.5px] text-muted mb-1">{caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${caption}. Final value ${format(points[points.length - 1].v)}.`}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line-strong)" />
        <line x1={P} x2={W - P} y1={y(vmax)} y2={y(vmax)} stroke="var(--line)" strokeDasharray="3 3" />
        <text x={P} y={y(vmax) - 4} fontSize="10" fill="var(--muted)" fontFamily="var(--font-geist-mono)">{format(vmax)}</text>
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(p.t)} cy={y(p.v)} r="10" fill="transparent" />
            <circle cx={x(p.t)} cy={y(p.v)} r="4" fill="var(--ink)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
        {hover != null && (
          <g transform={`translate(${Math.min(x(points[hover].t) + 8, W - 190)} ${Math.max(y(points[hover].v) - 34, 4)})`}>
            <rect width="180" height="30" fill="var(--ink)" rx="2" />
            <text x="8" y="12" fontSize="10" fill="var(--surface)">{points[hover].label.slice(0, 30)}</text>
            <text x="8" y="24" fontSize="10" fill="var(--accent)" fontFamily="var(--font-geist-mono)">{format(points[hover].v)} cumulative</text>
          </g>
        )}
        <text x={P} y={H - 8} fontSize="10" fill="var(--muted)">{new Date(t0).toLocaleDateString()}</text>
        <text x={W - P} y={H - 8} fontSize="10" fill="var(--muted)" textAnchor="end">{new Date(t1).toLocaleDateString()}</text>
      </svg>
    </figure>
  );
}

/** Two-bar comparison (baseline vs improved) on one shared scale starting at zero. */
export function Compare({ a, b, format }: { a: { label: string; v: number }; b: { label: string; v: number }; format: (v: number) => string }) {
  const max = Math.max(a.v, b.v, 1e-9);
  return (
    <div className="flex flex-col gap-3">
      {[a, b].map((x, i) => (
        <div key={x.label} title={`${x.label}: ${format(x.v)}`}>
          <div className="flex justify-between text-[12px]"><span>{x.label}</span><span className="num">{format(x.v)}</span></div>
          <div className="mt-1 h-3"><div className={cn("h-full rounded-r-[4px]", i === 0 ? "bg-steel" : "bg-primary")} style={{ width: `${(x.v / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
