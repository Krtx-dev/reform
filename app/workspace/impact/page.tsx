"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Info, X } from "lucide-react";
import { requestHash } from "@/core/optimization/prepare";
import { planConsumption } from "@/core/production/commit";
import { useWorkspace } from "@/stores/workspace";
import { useFormat } from "@/lib/format";
import { Button, EmptyState, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { BarList, Compare, StepLine } from "@/components/analytics/Charts";

const METHOD: { id: string; name: string; formula: string; note: string }[] = [
  { id: "total", name: "Total available area", formula: "Σ width × height over every selected material piece (quantity − reserved)", note: "Gross area, including defects and material no requested product can use." },
  { id: "eligible", name: "Eligible usable area", formula: "Σ (width × height − union(defects)) over pieces whose fabric is accepted by at least one requested product", note: "The utilization denominator. Overlapping defects are counted once (exact rectangle union)." },
  { id: "used", name: "Allocated cut-pattern area", formula: "Σ cut width × cut height of pieces that belong to COMPLETE products", note: "Cut size = finished size + 2 × seam allowance per side. Clearance gaps and off-cuts are never counted. Partial products are rolled back and contribute nothing." },
  { id: "net", name: "Net finished product area", formula: "Σ finished width × finished height (no seam allowance)", note: "Reported separately so seam allowance is not presented as product." },
  { id: "util", name: "Material utilization", formula: "allocated cut-pattern area ÷ eligible usable area", note: "0 when the denominator is 0. Always in [0, 1]." },
  { id: "unalloc", name: "Remaining unallocated area", formula: "eligible usable area − allocated cut-pattern area", note: "Includes clearance gaps, edge margins and pieces too small for any product." },
  { id: "mass", name: "Estimated mass allocated", formula: "Σ per piece: cut area (m²) × GSM of its own material ÷ 1000 → kg", note: "Calculated per material before aggregating; materials without GSM are excluded and the coverage is shown. Never assumes a default GSM." },
  { id: "value", name: "Equivalent replacement value", formula: "Σ cut area × (replacement cost of the material piece ÷ its area)", note: "Only where the user entered a cost. Product value is a separate, illustrative figure." },
  { id: "delta", name: "Improvement vs baseline", formula: "U(search) − U(First-Fit Shelf) in percentage points; relative = Δ ÷ U(baseline)", note: "Both runs use identical inputs. Shown only when the baseline matches current inputs." },
];

export default function ImpactPage() {
  const ws = useWorkspace();
  const f = useFormat();
  const [drawer, setDrawer] = useState<string | null>(null);
  const s = ws.project!.settings;
  const req = useMemo(() => ws.buildRequest(), [ws.remnants, ws.products, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = s.lastResult?.ok ? s.lastResult : null;
  const outdated = !!r && !!req && r.inputHash !== requestHash(req);
  const base = s.baselineResult?.ok && req && s.baselineResult.inputHash === requestHash({ ...req, algorithm: "shelf" }) ? s.baselineResult : null;
  const committed = ws.plans.filter((p) => p.status === "committed").sort((a, b) => (a.committedAt ?? 0) - (b.committedAt ?? 0));
  const committedArea = committed.reduce((sum, p) => sum + p.result.metrics.usedCutArea, 0);
  const committedMass = committed.reduce((sum, p) => sum + (p.result.metrics.allocatedMassKg ?? 0), 0);
  const inventoryArea = ws.remnants.reduce((sum, x) => sum + x.width * x.height * Math.max(0, x.quantity - x.reserved), 0);
  let cum = 0;
  const timeline = committed.map((p) => ({ t: p.committedAt ?? p.createdAt, v: (cum += p.result.metrics.usedCutArea) / 1e6, label: p.name }));

  const I = ({ id }: { id: string }) => (
    <button onClick={() => setDrawer(id)} className="text-muted hover:text-ink" aria-label={`How is ${METHOD.find((m) => m.id === id)?.name} calculated?`}><Info size={13} /></button>
  );

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <PageHeader
        eyebrow="Measured, not claimed"
        title="Waste recovery & impact"
        description="Material available, material allocated in a proposed plan, material consumed by committed plans, and physically verified recovery are reported separately. Allocation in a plan is not landfill diversion until it is cut and verified."
        actions={<Button onClick={() => setDrawer("util")} icon={<Info size={14} />}>Methodology</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 border border-line bg-surface rounded-[3px] divide-x divide-line mb-6">
        <div className="p-4"><div className="label-caps flex items-center gap-1">Material available <I id="total" /></div><div className="num text-[22px] mt-1">{f.area(inventoryArea)}</div><div className="text-[11px] text-muted">current inventory, unreserved</div></div>
        <div className="p-4"><div className="label-caps flex items-center gap-1">Allocated · proposed <I id="used" /></div><div className="num text-[22px] mt-1">{r ? f.area(r.metrics.usedCutArea) : "—"}</div><div className="text-[11px] text-muted">{r ? (outdated ? "latest run · inputs changed since" : "latest valid optimization") : "no optimization yet"}</div></div>
        <div className="p-4"><div className="label-caps">Consumed · committed</div><div className="num text-[22px] mt-1">{f.area(committedArea)}</div><div className="text-[11px] text-muted">{committed.length} committed plan{committed.length === 1 ? "" : "s"} · {committedMass.toFixed(2)} kg est.</div></div>
        <div className="p-4"><div className="label-caps">Physically verified</div><div className="num text-[22px] mt-1 text-muted">not recorded</div><div className="text-[11px] text-muted">REFORM has no measured post-cutting data</div></div>
      </div>

      {!r ? (
        <EmptyState title="No optimization to analyse" body="Run the optimizer to compute allocation by fabric and product." action={<Link href="/workspace/optimizer?run=1"><Button variant="primary">Run optimization</Button></Link>} />
      ) : (
        <>
          {outdated && <div className="mb-4 border border-warn/40 bg-warn-soft text-warn text-[12.5px] px-3 py-2 rounded-[3px]">The latest optimization was computed for different inputs. Figures describe that run; re-run the optimizer for current inventory.</div>}
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title={<span className="flex items-center gap-1.5">Utilization <I id="util" /></span>}>
              <div className="num text-[40px] leading-none"><mark className="bg-accent text-accent-ink px-1">{f.pct(r.metrics.utilization, 1)}</mark></div>
              <p className="text-[12px] text-muted mt-2">{f.area(r.metrics.usedCutArea)} of {f.area(r.metrics.eligibleUsableArea)} eligible usable area.</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <dt className="text-muted">Total area</dt><dd className="num text-right">{f.area(r.metrics.totalArea)}</dd>
                <dt className="text-muted">Eligible (gross)</dt><dd className="num text-right">{f.area(r.metrics.eligibleArea)}</dd>
                <dt className="text-muted">Excluded defects</dt><dd className="num text-right">{f.area(r.metrics.defectArea, 4)}</dd>
                <dt className="text-muted flex items-center gap-1">Net product area <I id="net" /></dt><dd className="num text-right">{f.area(r.metrics.netProductArea)}</dd>
                <dt className="text-muted flex items-center gap-1">Unallocated <I id="unalloc" /></dt><dd className="num text-right">{f.area(r.metrics.unallocatedArea)}</dd>
              </dl>
            </Panel>
            <Panel title={<span className="flex items-center gap-1.5">Baseline vs improved <I id="delta" /></span>}>
              {base ? (
                <>
                  <Compare a={{ label: "First-Fit Shelf baseline", v: base.metrics.utilization }} b={{ label: `${r.algorithm === "search" ? "Multi-strategy search" : r.algorithm}`, v: r.metrics.utilization }} format={(v) => f.pct(v, 1)} />
                  <p className="mt-3 text-[12.5px] num">Δ {((r.metrics.utilization - base.metrics.utilization) * 100).toFixed(2)} pts · {base.metrics.utilization > 0 ? `${(((r.metrics.utilization - base.metrics.utilization) / base.metrics.utilization) * 100).toFixed(1)}% relative` : "n/a"} · products {base.metrics.productsCompleted} → {r.metrics.productsCompleted}</p>
                </>
              ) : (
                <div className="text-[12.5px] text-muted flex flex-col items-start gap-2">No baseline for the current inputs. <Link href="/workspace/optimizer"><Button size="sm">Run “Compare baseline”</Button></Link></div>
              )}
            </Panel>
            <Panel title={<span className="flex items-center gap-1.5">Mass & value <I id="mass" /></span>}>
              <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
                <dt className="text-muted">Mass allocated</dt><dd className="num text-right">{f.kg(r.metrics.allocatedMassKg)}</dd>
                <dt className="text-muted">GSM coverage</dt><dd className="num text-right">{f.pct(r.metrics.massCoverage, 0)}</dd>
                <dt className="text-muted">Mass of eligible material</dt><dd className="num text-right">{f.kg(r.metrics.eligibleMassKg)}</dd>
                <dt className="text-muted flex items-center gap-1">Replacement value <I id="value" /></dt><dd className="num text-right">{f.money(r.metrics.replacementValue)}</dd>
                <dt className="text-muted">Cost coverage</dt><dd className="num text-right">{f.pct(r.metrics.costCoverage, 0)}</dd>
                <dt className="text-muted">Production value (illustr.)</dt><dd className="num text-right">{f.money(r.metrics.productionValue, 0)}</dd>
              </dl>
              <p className="mt-3 text-[11px] text-muted">No carbon or water factors are applied: REFORM does not have a defensible lifecycle comparison for these remnants.</p>
            </Panel>
          </div>

          <div className="grid gap-6 mt-6 lg:grid-cols-2">
            <Panel title="Material recovery by fabric type">
              <BarList caption="Allocated cut area (bar) against usable area (track), m²" trackLabel="Usable m²" valueLabel="Allocated" data={r.metrics.byFabric.map((x) => ({ label: x.fabricType, value: x.usedArea / 1e6, total: x.usableArea / 1e6, display: `${(x.usedArea / 1e6).toFixed(2)} m²`, sub: x.usableArea ? f.pct(x.usedArea / x.usableArea, 0) : undefined }))} />
            </Panel>
            <Panel title="Allocation by product">
              <BarList caption="Cut area of complete products, m²" valueLabel="Allocated" data={r.metrics.byProduct.filter((p) => p.units > 0).sort((a, b) => b.cutArea - a.cutArea).map((p) => ({ label: p.productName, value: p.cutArea / 1e6, display: `${(p.cutArea / 1e6).toFixed(2)} m²`, sub: `${p.units}/${p.demanded} units` }))} />
            </Panel>
            <Panel title="Remaining material composition">
              <BarList caption="Unallocated usable area by fabric, m² — candidates for new products" valueLabel="Unallocated" data={r.metrics.byFabric.map((x) => ({ label: x.fabricType, value: Math.max(0, x.usableArea - x.usedArea) / 1e6, display: `${(Math.max(0, x.usableArea - x.usedArea) / 1e6).toFixed(2)} m²` })).sort((a, b) => b.value - a.value)} />
            </Panel>
            <Panel title="Material consumed over time (committed plans)">
              <StepLine points={timeline} caption="Cumulative cut-pattern area of committed plans, m²" format={(v) => `${v.toFixed(2)} m²`} />
              {committed.length > 0 && (
                <ul className="mt-2 text-[11.5px] text-muted">
                  {committed.map((p) => <li key={p.id}>{p.name}: {planConsumption(p).reduce((a, l) => a + l.pieces, 0)} pieces · {f.area(p.result.metrics.usedCutArea)}</li>)}
                </ul>
              )}
            </Panel>
          </div>
          <Panel className="mt-6" title="Committed vs proposed plans">
            <table className="w-full text-[12.5px]">
              <thead className="text-[10.5px] text-muted text-left"><tr><th className="font-normal">Plan</th><th className="font-normal">Status</th><th className="font-normal text-right">Allocated</th><th className="font-normal text-right">Utilization</th><th className="font-normal text-right">Products</th><th className="font-normal text-right">Est. mass</th></tr></thead>
              <tbody>
                {ws.plans.length === 0 && <tr><td colSpan={6} className="py-3 text-muted">No saved plans.</td></tr>}
                {ws.plans.map((p) => (
                  <tr key={p.id} className="border-t border-line/60"><td className="py-1.5">{p.name}</td><td>{p.status === "committed" ? <Tag tone="green">committed</Tag> : <Tag>proposed</Tag>}</td><td className="text-right num">{f.area(p.result.metrics.usedCutArea)}</td><td className="text-right num">{f.pct(p.result.metrics.utilization)}</td><td className="text-right num">{p.result.metrics.productsCompleted}</td><td className="text-right num">{f.kg(p.result.metrics.allocatedMassKg)}</td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-50 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setDrawer(null)}>
            <motion.aside role="dialog" aria-label="Methodology" className="absolute right-0 top-0 h-full w-full max-w-md bg-surface border-l border-line-strong overflow-y-auto scroll-thin" initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }}>
              <div className="flex items-center justify-between h-12 px-4 border-b border-line sticky top-0 bg-surface">
                <span className="text-[14px] font-semibold">Methodology</span>
                <button aria-label="Close methodology" onClick={() => setDrawer(null)}><X size={16} /></button>
              </div>
              <div className="p-4 flex flex-col gap-4">
                {METHOD.map((m) => (
                  <section key={m.id} className={m.id === drawer ? "border-l-2 border-accent pl-3" : "pl-3.5"} ref={(el) => { if (el && m.id === drawer) el.scrollIntoView({ block: "center" }); }}>
                    <h3 className="text-[13px] font-semibold">{m.name}</h3>
                    <p className="font-mono text-[11.5px] mt-1 bg-surface-2 px-2 py-1.5 rounded-[2px]">{m.formula}</p>
                    <p className="text-[12px] text-muted mt-1">{m.note}</p>
                  </section>
                ))}
                <Link href="/methodology" className="text-[12.5px] text-primary hover:underline">Full technical methodology →</Link>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
