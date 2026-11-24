"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import type { AlgorithmId, MaxRectsHeuristic, ObjectiveMode } from "@/core/domain/types";
import { OBJECTIVE_FORMULAS } from "@/core/optimization/objective";
import { HEURISTIC_LABELS } from "@/core/optimization/maxrects/maxrects";
import { availableQuantity } from "@/core/optimization/prepare";
import { useWorkspace } from "@/stores/workspace";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/id";
import { Checkbox, Field, Input, Select, Swatch, Tag } from "@/components/ui/primitives";

type Tab = "materials" | "products" | "constraints";

export function InputPanel({ disabled }: { disabled: boolean }) {
  const [tab, setTab] = useState<Tab>("products");
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line bg-surface" aria-label="Optimization inputs">
      <div role="tablist" className="grid grid-cols-3 border-b border-line">
        {(["materials", "products", "constraints"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-10 text-[12px] font-medium capitalize border-b-2 -mb-px", tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto scroll-thin", disabled && "pointer-events-none opacity-60")} aria-busy={disabled}>
        {tab === "materials" && <Materials />}
        {tab === "products" && <Products />}
        {tab === "constraints" && <Constraints />}
      </div>
    </aside>
  );
}

function Materials() {
  const remnants = useWorkspace((s) => s.remnants);
  const settings = useWorkspace((s) => s.project!.settings);
  const toggle = useWorkspace((s) => s.toggleRemnantExcluded);
  const update = useWorkspace((s) => s.updateSettings);
  const f = useFormat();
  const excluded = new Set(settings.excludedRemnants);
  const included = remnants.filter((r) => !excluded.has(r.id));
  const area = included.reduce((s, r) => s + r.width * r.height * availableQuantity(r), 0);
  if (remnants.length === 0)
    return (
      <div className="p-4 text-[13px] text-muted">
        No materials yet. <Link className="text-primary underline" href="/workspace/inventory?new=1">Add a remnant</Link> or load the demo factory.
      </div>
    );
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-3 py-2">
        <span className="text-[11.5px] text-muted num">{included.length}/{remnants.length} lines · {f.area(area)}</span>
        <div className="flex gap-2 text-[11.5px]">
          <button className="text-primary hover:underline" onClick={() => update({ excludedRemnants: [] })}>All</button>
          <button className="text-primary hover:underline" onClick={() => update({ excludedRemnants: remnants.map((r) => r.id) })}>None</button>
        </div>
      </div>
      <ul>
        {remnants.map((r) => {
          const on = !excluded.has(r.id);
          const q = availableQuantity(r);
          return (
            <li key={r.id} className="border-b border-line/70">
              <label className={cn("flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-2", !on && "opacity-55")}>
                <input type="checkbox" className="mt-1 accent-[var(--primary)]" checked={on} onChange={() => toggle(r.id)} aria-label={`Include ${r.name}`} />
                <Swatch color={r.color} size={16} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[10.5px] text-muted">{r.id.length > 8 ? r.id.slice(0, 8) : r.id}</span>
                    <span className="truncate text-[12.5px] font-medium">{r.name}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1 mt-0.5 text-[11px] text-muted num">
                    {f.dims(r.width, r.height)} · ×{q}
                    {r.reserved > 0 && <span className="text-warn">({r.reserved} reserved)</span>}
                  </span>
                  <span className="flex flex-wrap gap-1 mt-1">
                    <Tag>{r.fabricType}</Tag>
                    {r.defects.length > 0 && <Tag tone="err">{r.defects.length} defect{r.defects.length > 1 ? "s" : ""}</Tag>}
                    {!r.allowRotation && <Tag tone="warn">no rotation</Tag>}
                    {r.grain !== "none" && <Tag>grain {r.grain}</Tag>}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Products() {
  const products = useWorkspace((s) => s.products);
  const remnants = useWorkspace((s) => s.remnants);
  const settings = useWorkspace((s) => s.project!.settings);
  const setDemand = useWorkspace((s) => s.setDemand);
  const f = useFormat();
  const excluded = new Set(settings.excludedRemnants);
  const compat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const allowed = new Set(p.allowedFabrics);
      m.set(p.id, remnants.filter((r) => !excluded.has(r.id) && allowed.has(r.fabricType)).reduce((s, r) => s + availableQuantity(r), 0));
    }
    return m;
  }, [products, remnants, settings.excludedRemnants]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = products.reduce((s, p) => s + (settings.demand[p.id]?.max ?? 0), 0);
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-3 py-2 text-[11.5px] text-muted">
        <span className="num">{total} units requested (max)</span>
        <Link className="text-primary hover:underline" href="/workspace/products">Library →</Link>
      </div>
      {products.length === 0 && <p className="p-4 text-[13px] text-muted">No product templates. Create one in the pattern library.</p>}
      <ul>
        {products.map((p) => {
          const d = settings.demand[p.id] ?? { max: 0, priority: false };
          const pieces = p.pieces.reduce((s, x) => s + x.quantity, 0);
          const c = compat.get(p.id) ?? 0;
          return (
            <li key={p.id} className="border-b border-line/70 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted num">
                    {pieces} pieces · SA {p.seamAllowance} mm · {f.money(p.value, 0)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c === 0 ? <Tag tone="err">no compatible material</Tag> : <Tag tone="green">{c} compatible pcs</Tag>}
                    {p.matchFabric && <Tag>matched fabric</Tag>}
                  </div>
                </div>
                <button
                  aria-label={d.priority ? `Remove priority from ${p.name}` : `Mark ${p.name} as priority`}
                  aria-pressed={d.priority}
                  title="Priority product (used by the priority objective and ordering)"
                  onClick={() => setDemand(p.id, d.max, !d.priority)}
                  className={cn("mt-0.5 h-7 w-7 flex items-center justify-center rounded-[3px] border", d.priority ? "border-warn/50 bg-warn-soft text-warn" : "border-line text-muted hover:text-ink")}
                >
                  <Star size={13} fill={d.priority ? "currentColor" : "none"} />
                </button>
                <div className="flex items-center">
                  <button aria-label={`Decrease ${p.name}`} className="h-7 w-6 border border-line-strong rounded-l-[3px] text-muted hover:text-ink" onClick={() => setDemand(p.id, d.max - 1)}>−</button>
                  <input aria-label={`Quantity of ${p.name}`} type="number" min={0} max={1000} value={d.max} onChange={(e) => setDemand(p.id, Number(e.target.value))} className="h-7 w-11 border-y border-line-strong bg-surface text-center text-[12.5px] num focus:outline-none" />
                  <button aria-label={`Increase ${p.name}`} className="h-7 w-6 border border-line-strong rounded-r-[3px] text-muted hover:text-ink" onClick={() => setDemand(p.id, d.max + 1)}>+</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Constraints() {
  const settings = useWorkspace((s) => s.project!.settings);
  const update = useWorkspace((s) => s.updateSettings);
  const c = settings.constraints;
  const setC = (patch: Partial<typeof c>) => update({ constraints: { ...c, ...patch } });
  const intIn = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const obj = OBJECTIVE_FORMULAS[settings.objective];
  return (
    <div className="flex flex-col gap-4 p-3">
      <Field label="Objective" htmlFor="objective" hint={obj.description}>
        <Select id="objective" value={settings.objective} onChange={(e) => update({ objective: e.target.value as ObjectiveMode })}>
          {(Object.keys(OBJECTIVE_FORMULAS) as ObjectiveMode[]).map((k) => (
            <option key={k} value={k}>{OBJECTIVE_FORMULAS[k].label}</option>
          ))}
        </Select>
      </Field>
      <div className="border border-line bg-surface-2/60 rounded-[3px] px-2.5 py-2 font-mono text-[11.5px]">
        score = {obj.formula}
        <div className="text-muted mt-1 font-sans text-[11px]">U utilization · P completion · V value share · F priority fulfillment. Physical metrics are reported separately.</div>
      </div>
      <Field label="Algorithm" htmlFor="algo">
        <Select id="algo" value={settings.algorithm} onChange={(e) => update({ algorithm: e.target.value as AlgorithmId })}>
          <option value="search">Multi-strategy search (recommended)</option>
          <option value="maxrects">MaxRects · single pass</option>
          <option value="shelf">Baseline · First-Fit Shelf</option>
        </Select>
      </Field>
      {settings.algorithm === "maxrects" && (
        <Field label="MaxRects heuristic" htmlFor="heur">
          <Select id="heur" value={settings.heuristic} onChange={(e) => update({ heuristic: e.target.value as MaxRectsHeuristic })}>
            {(Object.keys(HEURISTIC_LABELS) as MaxRectsHeuristic[]).map((h) => (
              <option key={h} value={h}>{HEURISTIC_LABELS[h]}</option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cutting clearance (mm)" htmlFor="clr">
          <Input id="clr" type="number" min={0} max={500} value={c.clearance} onChange={(e) => setC({ clearance: intIn(e.target.value, 0, 500) })} />
        </Field>
        <Field label="Edge margin (mm)" htmlFor="mrg">
          <Input id="mrg" type="number" min={0} max={500} value={c.edgeMargin} onChange={(e) => setC({ edgeMargin: intIn(e.target.value, 0, 500) })} />
        </Field>
      </div>
      <Checkbox checked={c.allowRotation} onChange={(v) => setC({ allowRotation: v })} label="Allow 90° rotation" description="Only where the material and the piece both permit it." />
      <Checkbox checked={c.respectGrain} onChange={(v) => setC({ respectGrain: v })} label="Enforce grain direction" description="Pieces with a grain requirement align with the material grain." />
      {settings.algorithm === "search" && (
        <div className="border-t border-line pt-3 grid grid-cols-3 gap-2">
          <Field label="Seed" htmlFor="seed">
            <Input id="seed" type="number" value={settings.search.seed} onChange={(e) => update({ search: { ...settings.search, seed: intIn(e.target.value, 0, 2 ** 31 - 1) } })} />
          </Field>
          <Field label="Iterations" htmlFor="it">
            <Input id="it" type="number" min={10} max={20000} value={settings.search.maxIterations} onChange={(e) => update({ search: { ...settings.search, maxIterations: intIn(e.target.value, 10, 20000) } })} />
          </Field>
          <Field label="Time (s)" htmlFor="tl">
            <Input id="tl" type="number" min={0.5} max={60} step={0.5} value={settings.search.timeLimitMs / 1000} onChange={(e) => update({ search: { ...settings.search, timeLimitMs: Math.max(500, Math.min(60000, Math.round(Number(e.target.value) * 1000) || 500)) } })} />
          </Field>
          <p className="col-span-3 text-[11px] text-muted">Deterministic for a given seed when the iteration budget is reached before the time limit.</p>
        </div>
      )}
    </div>
  );
}
