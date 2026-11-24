import type { BenchmarkResult } from "../domain/types";
import type { BenchmarkOptions } from "./benchmark";

/** Markdown report generated from actual benchmark executions. */
export function benchmarkMarkdown(results: BenchmarkResult[], options: BenchmarkOptions, env: string): string {
  const pct = (v: number) => `${(v * 100).toFixed(2)} %`;
  const out: string[] = [];
  out.push(`# REFORM benchmark report`);
  out.push("");
  out.push(`Generated ${new Date().toISOString()} · ${env}`);
  out.push(`Objective: ${options.objective ?? "material"} · seed ${options.seed ?? 42} · search budget ≤ ${options.maxIterations ?? 400} iterations / ${options.timeLimitMs ?? 3000} ms`);
  out.push("");
  out.push(`All algorithms received identical inventory, product templates, constraints and demand limits. Every layout was re-checked by the independent validator ("invalid" column). Datasets are synthetic and deterministic.`);
  out.push("");
  out.push(`| Dataset | Algorithm | Utilization | Products | Allocated m² | Unallocated m² | Value | Runtime ms | Invalid |`);
  out.push(`|---|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const b of results) {
    for (const r of b.rows) out.push(`| ${b.datasetName} | ${r.label} | ${pct(r.utilization)} | ${r.products} | ${(r.usedCutArea / 1e6).toFixed(3)} | ${(r.unallocatedArea / 1e6).toFixed(3)} | ${r.value.toFixed(0)} | ${r.runtimeMs.toFixed(0)} | ${r.invalidPlacements} |`);
  }
  out.push("");
  out.push(`## Improvement of multi-strategy search over the First-Fit Shelf baseline`);
  out.push("");
  out.push(`| Dataset | Baseline | Search | Δ points | Relative |`);
  out.push(`|---|---:|---:|---:|---:|`);
  for (const b of results) {
    const base = b.rows.find((r) => r.algorithm === "shelf")!;
    const s = b.rows.find((r) => r.algorithm === "search")!;
    out.push(`| ${b.datasetName} | ${pct(base.utilization)} | ${pct(s.utilization)} | ${b.improvementPts >= 0 ? "+" : ""}${b.improvementPts.toFixed(2)} | ${b.relativeImprovementPct == null ? "n/a" : `${b.relativeImprovementPct >= 0 ? "+" : ""}${b.relativeImprovementPct.toFixed(1)} %`} |`);
  }
  out.push("");
  out.push(`Note: the objective was material recovery, so the search may trade product count for utilization. Runtime depends on the machine; the search stops at the time limit if it is reached before the iteration budget, which makes results machine-dependent in that case.`);
  return out.join("\n") + "\n";
}
