"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FlaskConical, Loader2, Square } from "lucide-react";
import type { BenchmarkResult, ObjectiveMode } from "@/core/domain/types";
import type { BenchmarkInput, BenchmarkOptions } from "@/core/optimization/benchmark";
import { benchmarkMarkdown } from "@/core/optimization/benchmarkReport";
import { OBJECTIVE_FORMULAS } from "@/core/optimization/objective";
import { BENCHMARK_DATASETS, BENCHMARK_PRODUCTS } from "@/data/benchmarks/datasets";
import { runBenchmarks, type RunHandle } from "@/lib/optimizerClient";
import { useWorkspace } from "@/stores/workspace";
import { useFormat } from "@/lib/format";
import { downloadText, cn } from "@/lib/id";
import { Button, Checkbox, Field, Input, PageHeader, Panel, ProgressBar, Select, Tag } from "@/components/ui/primitives";
import { LayoutThumb } from "@/components/canvas/LayoutThumb";

export default function BenchmarkPage() {
  const ws = useWorkspace();
  const f = useFormat();
  const [selected, setSelected] = useState<Set<string>>(new Set(BENCHMARK_DATASETS.map((d) => d.id)));
  const [includeWorkspace, setIncludeWorkspace] = useState(false);
  const [opts, setOpts] = useState<Required<BenchmarkOptions>>({ objective: "material", seed: 42, timeLimitMs: 3000, maxIterations: 400 });
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const handle = useRef<RunHandle<BenchmarkResult[]> | null>(null);

  const inputs = useMemo<BenchmarkInput[]>(() => {
    const list: BenchmarkInput[] = BENCHMARK_DATASETS.filter((d) => selected.has(d.id)).map((d) => ({ id: d.id, name: d.name, remnants: d.remnants, products: BENCHMARK_PRODUCTS, demand: d.demand, constraints: d.constraints }));
    if (includeWorkspace) {
      const req = ws.buildRequest();
      if (req && req.remnants.length && req.demand.length) list.push({ id: "workspace", name: `Current workspace (${ws.project?.name})`, remnants: req.remnants, products: req.products, demand: req.demand, constraints: req.constraints });
    }
    return list;
  }, [selected, includeWorkspace, ws]);

  const start = async () => {
    if (inputs.length === 0) return toast.error("Select at least one dataset.");
    setResults(null);
    setProgress({ done: 0, total: inputs.length, current: inputs[0].name });
    const h = runBenchmarks(inputs, opts, (done, total, current) => setProgress({ done, total, current }));
    handle.current = h;
    try {
      const r = await h.promise;
      setResults(r);
      setFocus(r[0]?.datasetId ?? null);
      toast.success(`Benchmarked ${r.length} dataset${r.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(`Benchmark failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
      handle.current = null;
    }
  };

  const focused = results?.find((r) => r.datasetId === focus) ?? null;
  const productIds = BENCHMARK_PRODUCTS.map((p) => p.id).concat(ws.products.map((p) => p.id));
  const summary = results
    ? {
        wins: results.filter((r) => r.improvementPts > 0.005).length,
        ties: results.filter((r) => Math.abs(r.improvementPts) <= 0.005).length,
        losses: results.filter((r) => r.improvementPts < -0.005).length,
        mean: results.reduce((s, r) => s + r.improvementPts, 0) / results.length,
        invalid: results.reduce((s, r) => s + r.rows.reduce((a, x) => a + x.invalidPlacements, 0), 0),
      }
    : null;

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <PageHeader
        eyebrow="Algorithm laboratory"
        title="Benchmark: baseline vs. improved"
        description="Runs the First-Fit Shelf baseline, a single MaxRects pass and the multi-strategy search on identical inputs, then re-validates every layout independently. Nothing is pre-computed: numbers appear only after the algorithms run in your browser."
        actions={
          progress ? (
            <Button variant="danger" icon={<Square size={13} />} onClick={() => handle.current?.cancel()}>Stop after current dataset</Button>
          ) : (
            <Button variant="primary" icon={<FlaskConical size={14} />} onClick={start} data-testid="run-benchmark">Run benchmark</Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Datasets & budget" className="self-start">
          <div className="flex flex-col gap-2">
            {BENCHMARK_DATASETS.map((d) => (
              <Checkbox
                key={d.id}
                checked={selected.has(d.id)}
                onChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(d.id); else n.delete(d.id); return n; })}
                label={d.name}
                description={`${d.description} ${d.remnants.reduce((s, r) => s + r.quantity, 0)} pieces.`}
              />
            ))}
            <Checkbox checked={includeWorkspace} onChange={setIncludeWorkspace} label="Current workspace inventory" description="Uses your current materials, products and demand." />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Field className="col-span-2" label="Objective" htmlFor="b-obj">
              <Select id="b-obj" value={opts.objective} onChange={(e) => setOpts({ ...opts, objective: e.target.value as ObjectiveMode })}>
                {(Object.keys(OBJECTIVE_FORMULAS) as ObjectiveMode[]).map((k) => <option key={k} value={k}>{OBJECTIVE_FORMULAS[k].label}</option>)}
              </Select>
            </Field>
            <Field label="Seed" htmlFor="b-seed"><Input id="b-seed" type="number" value={opts.seed} onChange={(e) => setOpts({ ...opts, seed: Math.round(Number(e.target.value) || 0) })} /></Field>
            <Field label="Search iterations" htmlFor="b-it"><Input id="b-it" type="number" min={10} value={opts.maxIterations} onChange={(e) => setOpts({ ...opts, maxIterations: Math.max(10, Math.round(Number(e.target.value) || 10)) })} /></Field>
            <Field className="col-span-2" label="Search time limit per dataset (ms)" htmlFor="b-tl"><Input id="b-tl" type="number" min={200} step={100} value={opts.timeLimitMs} onChange={(e) => setOpts({ ...opts, timeLimitMs: Math.max(200, Math.round(Number(e.target.value) || 200)) })} /></Field>
          </div>
          <p className="mt-3 text-[11.5px] text-muted">Budgets differ by design: the baseline and MaxRects make one deterministic pass; the search evaluates many candidate orderings within the budget above. Runtime is reported for each.</p>
        </Panel>

        <div className="flex flex-col gap-6 min-w-0">
          {progress && (
            <Panel title="Running">
              <div className="flex items-center gap-2 text-[13px]"><Loader2 size={14} className="animate-spin" /> {progress.current} ({progress.done + 1}/{progress.total})</div>
              <ProgressBar className="mt-3" value={progress.done / progress.total} />
            </Panel>
          )}
          {!results && !progress && (
            <div className="border border-dashed border-line-strong p-10 text-center text-[13px] text-muted tech-grid rounded-[3px]">No benchmark has been run in this session. Choose datasets and press <strong>Run benchmark</strong>.</div>
          )}
          {results && summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 border border-line bg-surface rounded-[3px] divide-x divide-line">
                <div className="p-4"><div className="label-caps">Datasets</div><div className="num text-[22px]">{results.length}</div></div>
                <div className="p-4"><div className="label-caps">Search better</div><div className="num text-[22px] text-primary">{summary.wins}</div></div>
                <div className="p-4"><div className="label-caps">Tie / baseline better</div><div className="num text-[22px]">{summary.ties} / <span className={summary.losses ? "text-err" : ""}>{summary.losses}</span></div></div>
                <div className="p-4"><div className="label-caps">Mean Δ utilization</div><div className="num text-[22px]"><mark className="bg-accent text-accent-ink px-1">{summary.mean >= 0 ? "+" : ""}{summary.mean.toFixed(2)} pts</mark></div></div>
                <div className="p-4"><div className="label-caps">Invalid placements</div><div className={cn("num text-[22px]", summary.invalid ? "text-err" : "text-primary")}>{summary.invalid}</div></div>
              </div>

              <Panel
                title="Results"
                bodyClass="p-0"
                actions={
                  <>
                    <Button size="sm" icon={<Download size={13} />} onClick={() => downloadText(`reform-benchmark-${Date.now()}.md`, benchmarkMarkdown(results, opts, navigator.userAgent), "text/markdown")} data-testid="download-benchmark">Report (.md)</Button>
                    <Button size="sm" icon={<Download size={13} />} onClick={() => downloadText(`reform-benchmark-${Date.now()}.json`, JSON.stringify(results.map((r) => ({ datasetId: r.datasetId, datasetName: r.datasetName, rows: r.rows, improvementPts: r.improvementPts, relativeImprovementPct: r.relativeImprovementPct })), null, 2), "application/json")}>JSON</Button>
                  </>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-[12.5px]" data-testid="benchmark-table">
                    <thead className="text-left text-[10.5px] text-muted">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 font-normal">Dataset</th><th className="font-normal">Algorithm</th><th className="font-normal text-right">Utilization</th><th className="font-normal text-right">Products</th><th className="font-normal text-right">Allocated</th><th className="font-normal text-right">Unallocated</th><th className="font-normal text-right">Value</th><th className="font-normal text-right">Runtime</th><th className="font-normal text-right">Invalid</th><th className="font-normal text-right pr-4">Δ vs baseline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((b) => {
                        const best = Math.max(...b.rows.map((r) => r.utilization));
                        const base = b.rows.find((r) => r.algorithm === "shelf")!;
                        return b.rows.map((r, i) => (
                          <tr key={b.datasetId + r.algorithm} className={cn("border-b border-line/60 cursor-pointer hover:bg-surface-2", i === b.rows.length - 1 && "border-line", focus === b.datasetId && "bg-surface-2/70")} onClick={() => setFocus(b.datasetId)}>
                            <td className="px-4 py-1.5">{i === 0 ? <span className="font-medium">{b.datasetName}</span> : ""}</td>
                            <td>{r.label}</td>
                            <td className="text-right num">{r.utilization === best ? <mark className="bg-accent text-accent-ink px-1">{f.pct(r.utilization, 2)}</mark> : f.pct(r.utilization, 2)}</td>
                            <td className="text-right num">{r.products}</td>
                            <td className="text-right num">{f.m2(r.usedCutArea, 3)}</td>
                            <td className="text-right num">{f.m2(r.unallocatedArea, 3)}</td>
                            <td className="text-right num">{f.money(r.value, 0)}</td>
                            <td className="text-right num" title={r.budget}>{f.ms(r.runtimeMs)}</td>
                            <td className={cn("text-right num", r.invalidPlacements ? "text-err" : "text-muted")}>{r.invalidPlacements}</td>
                            <td className={cn("text-right num pr-4", r.algorithm === "shelf" ? "text-muted" : r.utilization > base.utilization ? "text-primary" : r.utilization < base.utilization ? "text-err" : "text-muted")}>
                              {r.algorithm === "shelf" ? "baseline" : `${r.utilization >= base.utilization ? "+" : ""}${((r.utilization - base.utilization) * 100).toFixed(2)} pts${base.utilization > 0 ? ` (${(((r.utilization - base.utilization) / base.utilization) * 100).toFixed(1)}%)` : ""}`}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {focused && (
                <Panel title={`Side by side · ${focused.datasetName}`} actions={<Tag>{focused.results.search.strategy}</Tag>}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {(["shelf", "search"] as const).map((a) => {
                      const r = focused.results[a];
                      return (
                        <figure key={a}>
                          <figcaption className="mb-1.5 flex items-center justify-between text-[12px]">
                            <span className="font-medium">{a === "shelf" ? "Baseline · First-Fit Shelf" : "Multi-strategy search"}</span>
                            <span className="num text-muted">{f.pct(r.metrics.utilization, 2)} · {r.metrics.productsCompleted} products</span>
                          </figcaption>
                          <div className="bg-canvas border border-line tech-grid p-2">
                            <LayoutThumb instances={r.instances} placements={r.placements} productIds={productIds} usedOnly={false} className="w-full h-[320px]" />
                          </div>
                        </figure>
                      );
                    })}
                  </div>
                </Panel>
              )}

              <Panel title="Heuristic limitations">
                <ul className="list-disc pl-5 text-[12.5px] text-muted flex flex-col gap-1">
                  <li>2D bin packing with multiple products is NP-hard; the search is a heuristic and does not guarantee a globally optimal plan. No optimality gap is claimed.</li>
                  <li>Pieces are axis-aligned rectangles with 0°/90° rotation. Irregular pattern shapes are represented by enclosing rectangles, which under-reports achievable nesting.</li>
                  <li>Allocation is greedy per product unit with transactional rollback; once a product fails to fit it is skipped for the rest of that candidate sequence.</li>
                  <li>With the material objective the search may prefer smaller products, producing fewer units than the baseline while using more material — check the products column.</li>
                  <li>When the time limit is hit before the iteration budget, search results depend on machine speed.</li>
                </ul>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
