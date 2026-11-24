"use client";

import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import type { MaterialInstance, OptimizationResult, Placement, ProductTemplate } from "@/core/domain/types";
import { OBJECTIVE_FORMULAS } from "@/core/optimization/objective";
import { instanceDefectArea } from "@/core/impact/metrics";
import type { ProgressInfo } from "@/core/optimization/engine";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/id";
import { ProgressBar, Tag } from "@/components/ui/primitives";

export interface ProductDiff {
  productId: string;
  name: string;
  before: number;
  after: number;
}

function Row({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12.5px]">
      <span className="text-muted">{k}</span>
      <span className={cn("text-right", mono && "num")}>{v}</span>
    </div>
  );
}

function Spark({ result }: { result: OptimizationResult }) {
  const pts = result.history.filter((h) => h.kind === "improvement" || h.kind === "progress");
  if (pts.length < 2) return null;
  const maxI = Math.max(1, ...pts.map((p) => p.iteration));
  const vals = pts.map((p) => p.utilization);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 240;
  const H = 54;
  const y = (v: number) => (hi === lo ? H / 2 : H - 4 - ((v - lo) / (hi - lo)) * (H - 8));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${((p.iteration / maxI) * W).toFixed(1)},${y(p.utilization).toFixed(1)}`).join(" ");
  return (
    <figure className="mt-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[54px]" role="img" aria-label={`Best utilization rose from ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}% over ${maxI} iterations`}>
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="1.5" />
        {pts.filter((p) => p.kind === "improvement").map((p, i) => (
          <rect key={i} x={(p.iteration / maxI) * W - 1.5} y={y(p.utilization) - 1.5} width="3" height="3" fill="var(--ink)" />
        ))}
      </svg>
      <figcaption className="flex justify-between text-[10.5px] text-muted num">
        <span>it 0 · {(lo * 100).toFixed(1)}%</span>
        <span>it {maxI} · {(hi * 100).toFixed(1)}%</span>
      </figcaption>
    </figure>
  );
}

export function Inspector({
  result,
  outdated,
  running,
  progress,
  diff,
  prevUtil,
  baseline,
  selectedPiece,
  selectedInstance,
  products,
}: {
  result: OptimizationResult | null;
  outdated: boolean;
  running: boolean;
  progress: ProgressInfo | null;
  diff: ProductDiff[];
  prevUtil: number | null;
  baseline: OptimizationResult | null;
  selectedPiece: Placement | null;
  selectedInstance: MaterialInstance | null;
  products: ProductTemplate[];
}) {
  const f = useFormat();
  const m = result?.metrics;
  const pname = new Map(products.map((p) => [p.id, p.name]));
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-surface" aria-label="Optimization inspector">
      <div className="flex h-10 items-center justify-between border-b border-line px-3">
        <span className="text-[12px] font-semibold">Inspector</span>
        {running ? <Tag tone="warn">running</Tag> : !result ? <Tag>no result</Tag> : !result.ok ? <Tag tone="err">failed</Tag> : outdated ? <Tag tone="warn">outdated</Tag> : result.validation.valid ? <Tag tone="green">valid</Tag> : <Tag tone="err">invalid</Tag>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {running && progress && (
          <section className="border-b border-line p-3" aria-live="polite">
            <div className="label-caps mb-2">Search in progress</div>
            <ProgressBar value={Math.max(progress.iteration / Math.max(1, progress.maxIterations), progress.timeLimitMs ? progress.elapsedMs / progress.timeLimitMs : 0)} />
            <Row k="Iteration" v={`${progress.iteration} / ${progress.maxIterations}`} />
            <Row k="Phase" v={progress.phase} />
            <Row k="Elapsed" v={f.ms(progress.elapsedMs)} />
            <Row k="Best utilization" v={f.pct(progress.bestUtilization, 2)} />
            <Row k="Best products" v={progress.bestProducts} />
          </section>
        )}

        {selectedPiece && (
          <section className="border-b border-line p-3 bg-accent/15">
            <div className="label-caps mb-1">Selected piece</div>
            <div className="text-[13px] font-semibold">{pname.get(selectedPiece.productId)} · {selectedPiece.pieceName}</div>
            <Row k="Unit" v={selectedPiece.unitId} />
            <Row k="Material" v={selectedPiece.instanceId} />
            <Row k="Position" v={`x ${selectedPiece.x} · y ${selectedPiece.y} mm`} />
            <Row k="Cut size" v={`${selectedPiece.w} × ${selectedPiece.h} mm`} />
            <Row k="Rotated 90°" v={selectedPiece.rotated ? "yes" : "no"} />
            <Row k="Finished area" v={f.area(selectedPiece.netArea, 4)} />
            <Row k="Solver order" v={`#${selectedPiece.seq + 1}`} />
          </section>
        )}
        {selectedInstance && (
          <section className="border-b border-line p-3 bg-accent/15">
            <div className="label-caps mb-1">Selected material</div>
            <div className="text-[13px] font-semibold">{selectedInstance.id} · {selectedInstance.name}</div>
            <Row k="Size" v={f.dims(selectedInstance.width, selectedInstance.height)} />
            <Row k="Fabric" v={selectedInstance.fabricType} mono={false} />
            <Row k="Grain / rotation" v={`${selectedInstance.grain} / ${selectedInstance.allowRotation ? "allowed" : "forbidden"}`} />
            <Row k="Defect area" v={f.area(instanceDefectArea(selectedInstance), 4)} />
            {result && (() => {
              const used = result.placements.filter((p) => p.instanceId === selectedInstance.id);
              const a = used.reduce((s, p) => s + p.w * p.h, 0);
              const usable = selectedInstance.width * selectedInstance.height - instanceDefectArea(selectedInstance);
              return (
                <>
                  <Row k="Pieces cut" v={used.length} />
                  <Row k="Instance utilization" v={f.pct(usable > 0 ? a / usable : 0)} />
                </>
              );
            })()}
          </section>
        )}

        {!result && !running && <p className="p-4 text-[12.5px] text-muted">Run an optimization to see utilization, complete products and validation.</p>}

        {result && !result.ok && (
          <section className="p-3 border-b border-line">
            <div className="flex gap-2 text-err text-[12.5px]"><XCircle size={15} className="shrink-0 mt-0.5" /> {result.error}</div>
          </section>
        )}

        {result && result.ok && m && (
          <div className={cn(outdated && "opacity-55")}>
            {outdated && <div className="px-3 py-2 text-[11.5px] bg-warn-soft text-warn border-b border-line">Inputs changed since this result. Figures below describe the previous inputs.</div>}
            <section className="border-b border-line p-3">
              <div className="label-caps">Material utilization</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="num text-[34px] leading-none tracking-tight"><mark className="bg-accent text-accent-ink px-1">{f.pct(m.utilization, 1)}</mark></span>
                {prevUtil != null && Math.abs(m.utilization - prevUtil) > 1e-9 && (
                  <span className={cn("num text-[12px]", m.utilization > prevUtil ? "text-primary" : "text-err")}>
                    {m.utilization > prevUtil ? "+" : ""}{((m.utilization - prevUtil) * 100).toFixed(1)} pts
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted mt-1">Cut area of complete products ÷ eligible usable area ({f.area(m.eligibleUsableArea)}).</p>
              {baseline && baseline.ok && (
                <div className="mt-2 text-[11.5px] num">
                  Baseline (shelf) <span className="text-muted">{f.pct(baseline.metrics.utilization)}</span> →{" "}
                  <span className={m.utilization >= baseline.metrics.utilization ? "text-primary" : "text-err"}>
                    {m.utilization >= baseline.metrics.utilization ? "+" : ""}{((m.utilization - baseline.metrics.utilization) * 100).toFixed(1)} pts
                  </span>
                </div>
              )}
              <Spark result={result} />
            </section>
            <section className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-line p-3">
              <div><div className="label-caps">Complete products</div><div className="num text-[20px]">{m.productsCompleted}</div></div>
              <div><div className="label-caps">Material pieces used</div><div className="num text-[20px]">{m.instancesUsed}<span className="text-[12px] text-muted">/{result.instances.length}</span></div></div>
              <div><div className="label-caps">Allocated</div><div className="num text-[15px]">{f.area(m.usedCutArea)}</div></div>
              <div><div className="label-caps">Unallocated</div><div className="num text-[15px]">{f.area(m.unallocatedArea)}</div></div>
              <div><div className="label-caps">Est. mass allocated</div><div className="num text-[15px]">{f.kg(m.allocatedMassKg)}</div></div>
              <div><div className="label-caps">Production value</div><div className="num text-[15px]">{f.money(m.productionValue, 0)}</div></div>
            </section>
            <section className="border-b border-line p-3">
              <div className="label-caps mb-1.5">Products</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted text-[10.5px]"><th className="text-left font-normal">Product</th><th className="text-right font-normal">Made / max</th><th className="text-right font-normal w-12">Δ</th></tr>
                </thead>
                <tbody>
                  {m.byProduct.map((p) => {
                    const d = diff.find((x) => x.productId === p.productId);
                    const delta = d ? d.after - d.before : 0;
                    return (
                      <tr key={p.productId} className="border-t border-line/60">
                        <td className="py-1 truncate max-w-[130px]">{p.productName}</td>
                        <td className="py-1 text-right num">{p.units}<span className="text-muted">/{p.demanded}</span></td>
                        <td className={cn("py-1 text-right num", delta > 0 ? "text-primary" : delta < 0 ? "text-err" : "text-muted")}>{delta === 0 ? "·" : `${delta > 0 ? "+" : ""}${delta}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <section className="border-b border-line p-3">
              <div className="label-caps mb-1.5">Independent validation</div>
              <ul className="flex flex-col gap-1">
                {result.validation.checks.map((c) => (
                  <li key={c.id} className="flex gap-1.5 text-[11.5px]" title={c.detail}>
                    {c.passed ? <CheckCircle2 size={13} className="text-primary shrink-0 mt-px" /> : <CircleAlert size={13} className="text-err shrink-0 mt-px" />}
                    <span><span className="font-medium">{c.label}</span> <span className="text-muted">— {c.detail}</span></span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="p-3">
              <div className="label-caps mb-1">Run</div>
              <Row k="Algorithm" v={result.algorithm} />
              <Row k="Best strategy" v={<span className="text-[11px]">{result.strategy}</span>} />
              <Row k="Objective" v={OBJECTIVE_FORMULAS[result.objective].label} mono={false} />
              <Row k="Objective score" v={result.score.toFixed(4)} />
              <Row k="Iterations / evaluations" v={`${result.iterations} / ${result.evaluations}`} />
              <Row k="Runtime" v={f.ms(result.runtimeMs)} />
              <Row k="Seed" v={result.seed} />
              <Row k="Input hash" v={result.inputHash} />
              {result.cancelled && <p className="text-[11px] text-warn mt-1">Stopped early — best valid layout found so far.</p>}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
