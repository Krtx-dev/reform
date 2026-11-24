import type { AlgorithmId, BenchmarkResult, BenchmarkRow, DemandLine, MaterialRemnant, ObjectiveMode, OptimizationConstraints, OptimizationRequest, OptimizationResult, ProductTemplate } from "../domain/types";
import { ALGORITHM_LABELS, optimize } from "./engine";
import { validateSolution } from "./validation/validator";

export interface BenchmarkInput {
  id: string;
  name: string;
  remnants: MaterialRemnant[];
  products: ProductTemplate[];
  demand: DemandLine[];
  constraints: OptimizationConstraints;
}

export interface BenchmarkOptions {
  objective?: ObjectiveMode;
  seed?: number;
  timeLimitMs?: number;
  maxIterations?: number;
}

export function benchmarkRequest(input: BenchmarkInput, algorithm: AlgorithmId, o: BenchmarkOptions = {}): OptimizationRequest {
  return {
    remnants: input.remnants,
    products: input.products,
    demand: input.demand,
    constraints: input.constraints,
    objective: o.objective ?? "material",
    algorithm,
    heuristic: "bssf",
    search: { seed: o.seed ?? 42, timeLimitMs: o.timeLimitMs ?? 3000, maxIterations: o.maxIterations ?? 400 },
  };
}

function row(r: OptimizationResult, req: OptimizationRequest, budget: string): BenchmarkRow {
  // Re-validate independently so the benchmark never trusts the engine's own flag.
  const v = validateSolution(req, r.placements, r.products);
  return {
    algorithm: r.algorithm,
    label: ALGORITHM_LABELS[r.algorithm],
    utilization: r.metrics.utilization,
    products: r.metrics.productsCompleted,
    usedCutArea: r.metrics.usedCutArea,
    unallocatedArea: r.metrics.unallocatedArea,
    value: r.metrics.productionValue,
    runtimeMs: r.runtimeMs,
    invalidPlacements: v.violations.length,
    evaluations: r.evaluations,
    budget,
  };
}

/** Run baseline, MaxRects and multi-strategy search on identical inputs. Nothing is predetermined. */
export function runBenchmark(input: BenchmarkInput, o: BenchmarkOptions = {}): BenchmarkResult {
  const algos: AlgorithmId[] = ["shelf", "maxrects", "search"];
  const results = {} as Record<AlgorithmId, OptimizationResult>;
  const rows: BenchmarkRow[] = [];
  for (const a of algos) {
    const req = benchmarkRequest(input, a, o);
    const r = optimize(req);
    results[a] = r;
    const budget = a === "search" ? `≤ ${req.search.maxIterations} iterations / ${req.search.timeLimitMs} ms, seed ${req.search.seed}` : "single deterministic pass";
    rows.push(row(r, req, budget));
  }
  const base = results.shelf.metrics.utilization;
  const best = results.search.metrics.utilization;
  return {
    datasetId: input.id,
    datasetName: input.name,
    rows,
    improvementPts: (best - base) * 100,
    relativeImprovementPct: base > 0 ? ((best - base) / base) * 100 : null,
    results,
  };
}
