import type {
  AlgorithmId,
  IterationSnapshot,
  MaxRectsHeuristic,
  OptimizationRequest,
  OptimizationResult,
} from "../domain/types";
import { baseAreas, computeMetrics, type BaseAreas } from "../impact/metrics";
import { createRng, type Rng } from "../random";
import { allocate, type Allocation, type PieceOrder } from "./allocate";
import { HEURISTIC_LABELS } from "./maxrects/maxrects";
import { objectiveScore } from "./objective";
import { maxRectsPlacer, shelfPlacer, type Placer } from "./placers";
import { prepareProblem, requestHash, type PreparedProblem } from "./prepare";
import { validateSolution } from "./validation/validator";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export const ALGORITHM_LABELS: Record<AlgorithmId, string> = {
  shelf: "Baseline · First-Fit Shelf",
  maxrects: "MaxRects",
  search: "Multi-strategy search",
};

const HEURISTICS: MaxRectsHeuristic[] = ["bssf", "baf", "bl", "blsf"];
const PIECE_ORDERS: PieceOrder[] = ["area", "longside"];
const MAX_IMPROVEMENT_SNAPSHOTS = 120;

interface Candidate {
  seq: string[];
  pool: string[];
  heuristic: MaxRectsHeuristic;
  pieceOrder: PieceOrder;
  label: string;
}

interface Evaluated {
  cand: Candidate;
  alloc: Allocation;
  score: number;
}

/** Product-unit sequence in demand order: all units of product 1, then product 2, … */
export function groupedSequence(problem: PreparedProblem, order?: (a: string, b: string) => number): string[] {
  const lines = [...problem.demand];
  if (order) lines.sort((a, b) => order(a.productId, b.productId));
  return lines.flatMap((d) => Array(d.max).fill(d.productId) as string[]);
}

/** Largest cut area first, ties by product id — independent of input list order. */
export function canonicalOrder(problem: PreparedProblem) {
  return (a: string, b: string) => problem.products.get(b)!.cutArea - problem.products.get(a)!.cutArea || a.localeCompare(b);
}

function roundRobin(problem: PreparedProblem): string[] {
  const left = new Map(problem.demand.map((d) => [d.productId, d.max]));
  const out: string[] = [];
  let any = true;
  while (any) {
    any = false;
    for (const d of problem.demand) {
      const r = left.get(d.productId)!;
      if (r > 0) {
        out.push(d.productId);
        left.set(d.productId, r - 1);
        any = true;
      }
    }
  }
  return out;
}

function scoreOf(req: OptimizationRequest, problem: PreparedProblem, base: BaseAreas, a: Allocation): number {
  return objectiveScore(req.objective, {
    usedCutArea: a.usedCutArea,
    eligibleUsableArea: base.eligibleUsableArea,
    units: a.products.length,
    value: a.value,
    priorityUnits: a.priorityUnits,
    totalDemandUnits: problem.totalDemandUnits,
    totalDemandValue: problem.totalDemandValue,
    totalPriorityUnits: problem.totalPriorityUnits,
  });
}

export interface ProgressInfo {
  iteration: number;
  maxIterations: number;
  elapsedMs: number;
  timeLimitMs: number;
  bestScore: number;
  bestUtilization: number;
  bestProducts: number;
  evaluations: number;
  phase: "construct" | "local-search" | "done";
}

export interface OptimizationSession {
  /** Run for up to `budgetMs`. Returns true when finished. */
  step(budgetMs: number): boolean;
  progress(): ProgressInfo;
  cancel(): void;
  /** Best valid result so far (final after `step` returns true). */
  result(): OptimizationResult;
}

function emptyResult(req: OptimizationRequest, problem: PreparedProblem | null, error: string): OptimizationResult {
  const p = problem ?? prepareProblem({ ...req, remnants: [], demand: [] });
  return {
    ok: false,
    error,
    algorithm: req.algorithm,
    strategy: ALGORITHM_LABELS[req.algorithm],
    objective: req.objective,
    seed: req.search.seed,
    instances: p.instances,
    placements: [],
    products: [],
    productCounts: {},
    metrics: computeMetrics(p, [], []),
    score: 0,
    validation: { valid: false, checks: [], violations: [error] },
    runtimeMs: 0,
    iterations: 0,
    evaluations: 0,
    history: [],
    inputHash: requestHash(req),
    cancelled: false,
    createdAt: Date.now(),
  };
}

export function createOptimizationSession(req: OptimizationRequest): OptimizationSession {
  const t0 = now();
  const problem = prepareProblem(req);
  const hash = requestHash(req);
  if (problem.errors.length === 0 && problem.instances.length === 0) problem.errors.push("No available material: add remnants or un-reserve existing ones.");
  if (problem.errors.length === 0 && problem.demand.length === 0) problem.errors.push("No products requested: set a quantity above zero for at least one product.");
  if (problem.errors.length > 0) {
    const r = emptyResult(req, problem, problem.errors.join(" "));
    return { step: () => true, progress: () => ({ iteration: 0, maxIterations: 0, elapsedMs: 0, timeLimitMs: 0, bestScore: 0, bestUtilization: 0, bestProducts: 0, evaluations: 0, phase: "done" }), cancel: () => {}, result: () => r };
  }
  const base = baseAreas(problem);
  const rng: Rng = createRng(req.search.seed);
  const placers = new Map<string, Placer<unknown>>();
  const getPlacer = (h: MaxRectsHeuristic | "shelf") => {
    let p = placers.get(h);
    if (!p) {
      p = (h === "shelf" ? shelfPlacer(problem) : maxRectsPlacer(problem, h)) as Placer<unknown>;
      placers.set(h, p);
    }
    return p;
  };

  const history: IterationSnapshot[] = [];
  let best: Evaluated | null = null;
  let current: Evaluated | null = null;
  let iteration = 0;
  let evaluations = 0;
  let done = false;
  let cancelled = false;
  let phase: ProgressInfo["phase"] = "construct";
  const maxIterations = req.algorithm === "search" ? Math.max(0, req.search.maxIterations) : 1;
  const timeLimit = req.algorithm === "search" ? Math.max(50, req.search.timeLimitMs) : Infinity;
  let strategyLabel = "";

  const evaluate = (cand: Candidate, placer: Placer<unknown>): Evaluated => {
    const alloc = allocate(problem, placer, cand.seq, cand.pieceOrder);
    evaluations++;
    return { cand, alloc, score: scoreOf(req, problem, base, alloc) };
  };

  const record = (e: Evaluated, label: string) => {
    const improvement = !best || e.score > best.score + 1e-12;
    if (improvement) {
      best = e;
      strategyLabel = label;
      const util = base.eligibleUsableArea > 0 ? e.alloc.usedCutArea / base.eligibleUsableArea : 0;
      history.push({ iteration, elapsedMs: now() - t0, score: e.score, utilization: util, products: e.alloc.products.length, kind: "improvement", label, placements: e.alloc.placements });
      // keep memory bounded: thin out older improvement snapshots, always keeping first and last
      const imps = history.filter((h) => h.kind === "improvement");
      if (imps.length > MAX_IMPROVEMENT_SNAPSHOTS) {
        const victim = imps[1 + Math.floor((imps.length - 2) / 2)];
        victim.placements = undefined;
        victim.kind = "progress";
      }
    }
    return improvement;
  };

  // ── Construction candidates ──
  const constructQueue: Candidate[] = [];
  if (req.algorithm === "shelf") {
    // Canonical order (largest product first) so the baseline does not depend on how the product list happens to be sorted.
    constructQueue.push({ seq: groupedSequence(problem, canonicalOrder(problem)), pool: [], heuristic: "bssf", pieceOrder: "height", label: "First-Fit Shelf · largest product first · decreasing height" });
  } else if (req.algorithm === "maxrects") {
    const h = req.heuristic ?? "bssf";
    constructQueue.push({ seq: groupedSequence(problem, canonicalOrder(problem)), pool: [], heuristic: h, pieceOrder: "area", label: `MaxRects ${HEURISTIC_LABELS[h]} · largest product first · largest area first` });
  } else {
    const area = (id: string) => problem.products.get(id)!.cutArea;
    const val = (id: string) => problem.products.get(id)!.template.value / Math.max(1, area(id));
    const prio = new Set(problem.demand.filter((d) => d.priority).map((d) => d.productId));
    const orders: [string, string[]][] = [
      ["demand order", groupedSequence(problem)],
      ["priority first", groupedSequence(problem, (a, b) => Number(prio.has(b)) - Number(prio.has(a)))],
      ["round-robin", roundRobin(problem)],
      ["largest product first", groupedSequence(problem, (a, b) => area(b) - area(a))],
      ["smallest product first", groupedSequence(problem, (a, b) => area(a) - area(b))],
      ["value density", groupedSequence(problem, (a, b) => val(b) - val(a))],
      ["seeded shuffle A", rng.shuffle(groupedSequence(problem))],
      ["seeded shuffle B", rng.shuffle(groupedSequence(problem))],
    ];
    for (const [name, seq] of orders)
      for (const h of HEURISTICS)
        for (const po of PIECE_ORDERS)
          constructQueue.push({ seq, pool: [], heuristic: h, pieceOrder: po, label: `MaxRects ${HEURISTIC_LABELS[h]} · ${name} · ${po === "area" ? "largest area" : "longest side"} first` });
  }

  const mutate = (c: Candidate): Candidate => {
    const seq = c.seq.slice();
    const pool = c.pool.slice();
    let heuristic = c.heuristic;
    let pieceOrder = c.pieceOrder;
    const moves = 1 + rng.int(3);
    for (let i = 0; i < moves; i++) {
      const r = rng.int(100);
      if (r < 30 && seq.length > 1) {
        const a = rng.int(seq.length);
        const b = rng.int(seq.length);
        [seq[a], seq[b]] = [seq[b], seq[a]];
      } else if (r < 55 && seq.length > 1) {
        const [u] = seq.splice(rng.int(seq.length), 1);
        seq.splice(rng.int(seq.length + 1), 0, u);
      } else if (r < 65 && seq.length > 2) {
        let a = rng.int(seq.length);
        let b = rng.int(seq.length);
        if (a > b) [a, b] = [b, a];
        const seg = seq.slice(a, b + 1).reverse();
        seq.splice(a, seg.length, ...seg);
      } else if (r < 75 && seq.length > 1) {
        pool.push(...seq.splice(rng.int(seq.length), 1)); // try a different product mix
      } else if (r < 85 && pool.length > 0) {
        const [u] = pool.splice(rng.int(pool.length), 1);
        seq.splice(rng.int(seq.length + 1), 0, u);
      } else if (r < 93) {
        heuristic = rng.pick(HEURISTICS);
      } else {
        pieceOrder = rng.pick(PIECE_ORDERS);
      }
    }
    return { seq, pool, heuristic, pieceOrder, label: `Local search · MaxRects ${HEURISTIC_LABELS[heuristic]}` };
  };

  let qi = 0;
  const step = (budgetMs: number): boolean => {
    if (done) return true;
    const stepEnd = now() + budgetMs;
    while (now() < stepEnd) {
      if (cancelled || now() - t0 > timeLimit) {
        done = true;
        break;
      }
      if (qi < constructQueue.length) {
        const cand = constructQueue[qi++];
        const e = evaluate(cand, getPlacer(req.algorithm === "shelf" ? "shelf" : cand.heuristic));
        record(e, cand.label);
        if (!current || e.score > current.score) current = e;
        iteration++;
        continue;
      }
      if (req.algorithm !== "search" || iteration >= maxIterations || !current) {
        done = true;
        break;
      }
      phase = "local-search";
      // Bounded local search with a simple cooling acceptance rule.
      const cand = mutate((current as Evaluated).cand);
      const e = evaluate(cand, getPlacer(cand.heuristic));
      const progress = iteration / Math.max(1, maxIterations);
      const temp = 0.01 * (1 - progress);
      const delta = e.score - (current as Evaluated).score;
      if (delta >= 0 || (temp > 0 && rng.next() < Math.exp(delta / temp))) current = e;
      record(e, cand.label);
      iteration++;
      if (iteration % 25 === 0 && best) {
        const b = best as Evaluated;
        history.push({ iteration, elapsedMs: now() - t0, score: b.score, utilization: base.eligibleUsableArea > 0 ? b.alloc.usedCutArea / base.eligibleUsableArea : 0, products: b.alloc.products.length, kind: "progress", label: "best so far" });
      }
    }
    if (done) phase = "done";
    return done;
  };

  let cached: OptimizationResult | null = null;
  let cachedFor: Evaluated | null = null;
  const result = (): OptimizationResult => {
    const b = best as Evaluated | null;
    if (!b) {
      const r = emptyResult(req, problem, cancelled ? "Cancelled before any solution was evaluated." : "No solution evaluated yet.");
      r.cancelled = cancelled;
      return r;
    }
    if (cached && cachedFor === b && cached.cancelled === cancelled && cached.iterations === iteration && !done) {
      return cached;
    }
    const validation = validateSolution(req, b.alloc.placements, b.alloc.products);
    const metrics = computeMetrics(problem, b.alloc.placements, b.alloc.products, base);
    cached = {
      ok: validation.valid,
      error: validation.valid ? undefined : "Internal error: the best solution failed independent validation and was rejected.",
      algorithm: req.algorithm,
      strategy: strategyLabel,
      objective: req.objective,
      seed: req.search.seed,
      instances: problem.instances,
      placements: validation.valid ? b.alloc.placements : [],
      products: validation.valid ? b.alloc.products : [],
      productCounts: validation.valid ? b.alloc.counts : {},
      metrics: validation.valid ? metrics : computeMetrics(problem, [], [], base),
      score: validation.valid ? b.score : 0,
      validation,
      runtimeMs: now() - t0,
      iterations: iteration,
      evaluations,
      history: history.slice(),
      inputHash: hash,
      cancelled,
      createdAt: Date.now(),
    };
    cachedFor = b;
    return cached;
  };

  return {
    step,
    cancel: () => {
      cancelled = true;
    },
    progress: () => {
      const b = best as Evaluated | null;
      return {
        iteration,
        maxIterations: req.algorithm === "search" ? Math.max(maxIterations, constructQueue.length) : 1,
        elapsedMs: now() - t0,
        timeLimitMs: Number.isFinite(timeLimit) ? timeLimit : 0,
        bestScore: b?.score ?? 0,
        bestUtilization: b && base.eligibleUsableArea > 0 ? b.alloc.usedCutArea / base.eligibleUsableArea : 0,
        bestProducts: b?.alloc.products.length ?? 0,
        evaluations,
        phase,
      };
    },
    result,
  };
}

/** Synchronous convenience wrapper (tests, benchmarks, CLI). */
export function optimize(req: OptimizationRequest, opts: { shouldCancel?: () => boolean } = {}): OptimizationResult {
  const s = createOptimizationSession(req);
  while (!s.step(25)) {
    if (opts.shouldCancel?.()) s.cancel();
  }
  return s.result();
}
