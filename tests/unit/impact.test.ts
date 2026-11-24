import { describe, expect, it } from "vitest";
import { optimize } from "@/core/optimization/engine";
import { computeMetrics, instanceDefectArea } from "@/core/impact/metrics";
import { prepareProblem } from "@/core/optimization/prepare";
import { objectiveScore, objectiveTerms } from "@/core/optimization/objective";
import { commitPlan, planConsumption } from "@/core/production/commit";
import { inventoryCsv, parseCsv, parseInventoryCsv, productionListCsv } from "@/core/exports/csv";
import { cuttingLayoutSvg } from "@/core/exports/svg";
import { remnantSchema, productSchema } from "@/core/domain/schemas";
import type { ProductionPlan } from "@/core/domain/types";
import { runBenchmark } from "@/core/optimization/benchmark";
import { BENCHMARK_DATASETS, BENCHMARK_PRODUCTS } from "@/data/benchmarks/datasets";
import { DEMO_INVENTORY } from "@/data/demo/inventory";
import { DEMO_PRODUCTS } from "@/data/demo/products";
import { piece, product, remnant, request } from "./helpers";

describe("impact metrics (hand-calculated)", () => {
  // 1000×1000 cotton (200 gsm, cost 10) with a 100×100 defect; 4 pieces 400×400.
  const rem = remnant({ id: "R", gsm: 200, replacementCost: 10, defects: [{ x: 900, y: 900, w: 100, h: 100 }] });
  const silk = remnant({ id: "S", fabricType: "silk", width: 500, height: 500 });
  const prod = product({ id: "P", value: 5, seamAllowance: 0, pieces: [piece({ width: 400, height: 400 })] });
  const req = request([rem, silk], [prod], 4);
  const r = optimize(req);

  it("computes area denominators", () => {
    expect(r.metrics.totalArea).toBe(1_000_000 + 250_000);
    expect(r.metrics.eligibleArea).toBe(1_000_000); // silk is incompatible
    expect(r.metrics.defectArea).toBe(10_000);
    expect(r.metrics.eligibleUsableArea).toBe(990_000);
  });
  it("computes used area, utilization and remaining area", () => {
    expect(r.metrics.productsCompleted).toBe(4);
    expect(r.metrics.usedCutArea).toBe(640_000);
    expect(r.metrics.utilization).toBeCloseTo(640_000 / 990_000, 12);
    expect(r.metrics.unallocatedArea).toBe(350_000);
  });
  it("computes mass from GSM per material", () => {
    // 0.64 m² × 200 g/m² = 128 g
    expect(r.metrics.allocatedMassKg).toBeCloseTo(0.128, 10);
    expect(r.metrics.massCoverage).toBe(1);
  });
  it("computes replacement value from cost per area", () => {
    // 10 per 1 m² → 0.64 m² = 6.4
    expect(r.metrics.replacementValue).toBeCloseTo(6.4, 10);
    expect(r.metrics.productionValue).toBe(20);
  });
  it("reports null mass/cost when unknown instead of assuming", () => {
    const r2 = optimize(request([remnant({ id: "Q" })], [prod], 1));
    expect(r2.metrics.allocatedMassKg).toBeNull();
    expect(r2.metrics.replacementValue).toBeNull();
    expect(r2.metrics.massCoverage).toBe(0);
  });
  it("aggregates mass per fabric type with different GSM", () => {
    const a = remnant({ id: "A", width: 1000, height: 1000, gsm: 100 });
    const b = remnant({ id: "B", width: 1000, height: 1000, gsm: 300, fabricType: "denim" });
    const p = product({ id: "P", allowedFabrics: ["cotton", "denim"], pieces: [piece({ width: 1000, height: 1000 })] });
    const res = optimize(request([a, b], [p], 2));
    expect(res.metrics.allocatedMassKg).toBeCloseTo(0.1 + 0.3, 10);
    expect(res.metrics.byFabric.find((f) => f.fabricType === "denim")!.massKg).toBeCloseTo(0.3);
  });
  it("handles a zero denominator", () => {
    const res = optimize(request([silk], [prod], 1));
    expect(res.metrics.eligibleUsableArea).toBe(0);
    expect(res.metrics.utilization).toBe(0);
  });
  it("counts union of overlapping defects once", () => {
    expect(instanceDefectArea({ width: 100, height: 100, defects: [{ x: 0, y: 0, w: 50, h: 50 }, { x: 25, y: 25, w: 50, h: 50 }, { x: 90, y: 90, w: 50, h: 50 }] })).toBe(2500 + 2500 - 625 + 100);
  });
  it("does not count pieces of incomplete products", () => {
    const problem = prepareProblem(req);
    const m = computeMetrics(problem, r.placements, r.products.slice(0, 2));
    expect(m.usedCutArea).toBe(2 * 160_000);
  });
  it("objective terms normalize correctly and guard zero denominators", () => {
    const t = objectiveTerms({ usedCutArea: 50, eligibleUsableArea: 100, units: 2, value: 10, priorityUnits: 0, totalDemandUnits: 4, totalDemandValue: 40, totalPriorityUnits: 0 });
    expect(t).toEqual({ U: 0.5, P: 0.5, V: 0.25, F: 0.5 });
    expect(objectiveScore("balanced", { usedCutArea: 50, eligibleUsableArea: 100, units: 2, value: 10, priorityUnits: 0, totalDemandUnits: 4, totalDemandValue: 40, totalPriorityUnits: 0 })).toBeCloseTo(0.4 * 0.5 + 0.3 * 0.5 + 0.3 * 0.25);
    expect(objectiveTerms({ usedCutArea: 0, eligibleUsableArea: 0, units: 0, value: 0, priorityUnits: 0, totalDemandUnits: 0, totalDemandValue: 0, totalPriorityUnits: 0 }).U).toBe(0);
  });
});

describe("production plan commits", () => {
  const rem = remnant({ id: "R", width: 500, height: 500, quantity: 3 });
  const prod = product({ id: "P", pieces: [piece({ width: 500, height: 500 })] });
  const req = request([rem], [prod], 2);
  const result = optimize(req);
  const plan: ProductionPlan = { id: "plan1", name: "Plan", createdAt: 0, status: "draft", request: req, result, notes: "" };

  it("deducts exactly the instances used", () => {
    expect(planConsumption(plan)).toEqual([{ remnantId: "R", name: rem.name, pieces: 2 }]);
    const out = commitPlan(plan, [rem]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.remnants[0].quantity).toBe(1);
      expect(out.remnants[0].consumed).toBe(2);
      expect(out.plan.status).toBe("committed");
    }
  });
  it("never deducts twice", () => {
    const first = commitPlan(plan, [rem]);
    if (!first.ok) throw new Error("expected ok");
    const second = commitPlan(first.plan, first.remnants);
    expect(second.ok).toBe(false);
    expect(first.remnants[0].quantity).toBe(1);
  });
  it("refuses when inventory changed", () => {
    expect(commitPlan(plan, [{ ...rem, width: 400 }]).ok).toBe(false);
    expect(commitPlan(plan, [{ ...rem, quantity: 1 }]).ok).toBe(false);
    expect(commitPlan(plan, []).ok).toBe(false);
  });
  it("does not modify inventory when generating an optimization", () => {
    expect(rem.quantity).toBe(3);
  });
});

describe("exports and imports", () => {
  const r = optimize(request(DEMO_INVENTORY, DEMO_PRODUCTS, 2, { algorithm: "maxrects", constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true } }));
  it("produces an SVG with millimetre units and every piece", () => {
    const svg = cuttingLayoutSvg(r, DEMO_PRODUCTS);
    expect(svg).toMatch(/width="\d+mm"/);
    for (const p of r.placements) expect(svg).toContain(`id="${p.id}"`);
  });
  it("produces a CSV production list with one row per placement", () => {
    const csv = productionListCsv(r, DEMO_PRODUCTS);
    expect(parseCsv(csv)).toHaveLength(r.placements.length + 1);
  });
  it("round-trips inventory CSV", () => {
    let i = 0;
    const parsed = parseInventoryCsv(inventoryCsv(DEMO_INVENTORY), () => `X${++i}`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.remnants).toHaveLength(DEMO_INVENTORY.length);
    expect(parsed.remnants.map((x) => [x.width, x.height, x.quantity, x.defects])).toEqual(DEMO_INVENTORY.map((x) => [x.width, x.height, x.quantity, x.defects]));
  });
  it("converts CSV units and reports bad rows", () => {
    const res = parseInventoryCsv("name,fabric_type,width,height,unit\nA,cotton,1.2,0.5,m\nB,plastic,10,10,cm\nC,linen,-1,10,cm\n", () => "id");
    expect(res.remnants).toHaveLength(1);
    expect(res.remnants[0].width).toBe(1200);
    expect(res.errors).toHaveLength(2);
  });
  it("validates demo data against schemas", () => {
    for (const x of DEMO_INVENTORY) expect(remnantSchema.safeParse(x).success).toBe(true);
    for (const x of DEMO_PRODUCTS) expect(productSchema.safeParse(x).success).toBe(true);
    expect(remnantSchema.safeParse({ ...DEMO_INVENTORY[0], width: 0 }).success).toBe(false);
    expect(remnantSchema.safeParse({ ...DEMO_INVENTORY[0], reserved: 99 }).success).toBe(false);
  });
});

describe("benchmark harness", () => {
  it("runs every algorithm on identical inputs with zero invalid placements", () => {
    const d = BENCHMARK_DATASETS.find((x) => x.id === "small-shop")!;
    const b = runBenchmark({ ...d, products: BENCHMARK_PRODUCTS }, { maxIterations: 120, timeLimitMs: 20_000 });
    expect(b.rows.map((r) => r.algorithm)).toEqual(["shelf", "maxrects", "search"]);
    for (const row of b.rows) expect(row.invalidPlacements).toBe(0);
    expect(b.improvementPts).toBeCloseTo((b.rows[2].utilization - b.rows[0].utilization) * 100, 10);
  });
});

describe("baseline fairness", () => {
  it("shelf and single-pass MaxRects do not depend on the order of the product list", async () => {
    const { DEMO_CONSTRAINTS, DEMO_INVENTORY } = await import("@/data/demo/inventory");
    const { DEMO_DEMAND } = await import("@/data/demo/products");
    for (const algorithm of ["shelf", "maxrects"] as const) {
      const base = { remnants: DEMO_INVENTORY, constraints: DEMO_CONSTRAINTS, objective: "material" as const, algorithm, heuristic: "bssf" as const, search: { seed: 1, timeLimitMs: 1000, maxIterations: 1 } };
      const a = optimize({ ...base, products: DEMO_PRODUCTS, demand: DEMO_DEMAND });
      const b = optimize({ ...base, products: [...DEMO_PRODUCTS].reverse(), demand: [...DEMO_DEMAND].reverse() });
      expect(b.metrics.utilization).toBe(a.metrics.utilization);
      expect(b.productCounts).toEqual(a.productCounts);
    }
  });
});
