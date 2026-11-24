import { describe, expect, it } from "vitest";
import { createOptimizationSession, optimize } from "@/core/optimization/engine";
import { allocate } from "@/core/optimization/allocate";
import { maxRectsPlacer } from "@/core/optimization/placers";
import { prepareProblem } from "@/core/optimization/prepare";
import { validateSolution } from "@/core/optimization/validation/validator";
import { ALL_ALGOS, piece, product, remnant, request } from "./helpers";

describe.each(ALL_ALGOS)("optimizer · %s", (algorithm) => {
  it("rejects an empty inventory with a clear error", () => {
    const r = optimize(request([], [product()], 1, { algorithm }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No available material/);
  });

  it("rejects an empty product demand", () => {
    const r = optimize(request([remnant()], [], [], { algorithm }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No products requested/);
  });

  it("produces zero products when the product is larger than every remnant", () => {
    const r = optimize(request([remnant({ width: 200, height: 200 })], [product({ pieces: [piece({ width: 300, height: 300 })] })], 5, { algorithm }));
    expect(r.ok).toBe(true);
    expect(r.metrics.productsCompleted).toBe(0);
    expect(r.metrics.utilization).toBe(0);
  });

  it("packs an exact fit: four 500×500 pieces fill a 1000×1000 sheet", () => {
    const r = optimize(request([remnant()], [product({ pieces: [piece({ width: 500, height: 500 })] })], 10, { algorithm }));
    expect(r.ok).toBe(true);
    expect(r.metrics.productsCompleted).toBe(4);
    expect(r.metrics.utilization).toBeCloseTo(1, 10);
    expect(r.validation.valid).toBe(true);
  });

  it("uses rotation when allowed (1000×300 strip, 300×1000 pieces)", () => {
    const rem = remnant({ width: 1000, height: 300 });
    const prod = product({ pieces: [piece({ width: 300, height: 1000 })] });
    expect(optimize(request([rem], [prod], 1, { algorithm })).metrics.productsCompleted).toBe(1);
    const noRot = optimize(request([{ ...rem, allowRotation: false }], [prod], 1, { algorithm }));
    expect(noRot.metrics.productsCompleted).toBe(0);
    const noRotGlobal = optimize(request([rem], [prod], 1, { algorithm, constraints: { clearance: 0, edgeMargin: 0, allowRotation: false, respectGrain: true } }));
    expect(noRotGlobal.metrics.productsCompleted).toBe(0);
    const pieceNoRot = optimize(request([rem], [product({ pieces: [piece({ width: 300, height: 1000, allowRotation: false })] })], 1, { algorithm }));
    expect(pieceNoRot.metrics.productsCompleted).toBe(0);
  });

  it("respects fabric compatibility", () => {
    const r = optimize(request([remnant({ fabricType: "silk" })], [product({ allowedFabrics: ["denim"] })], 3, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(0);
    expect(r.metrics.eligibleArea).toBe(0);
  });

  it("uses multiple material instances (quantity expansion)", () => {
    const r = optimize(request([remnant({ width: 500, height: 500, quantity: 3 })], [product({ pieces: [piece({ width: 500, height: 500 })] })], 10, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(3);
    expect(new Set(r.placements.map((p) => p.instanceId)).size).toBe(3);
  });

  it("excludes reserved quantity", () => {
    const r = optimize(request([remnant({ width: 500, height: 500, quantity: 3, reserved: 2 })], [product({ pieces: [piece({ width: 500, height: 500 })] })], 10, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(1);
  });

  it("places multiple required pieces per product and counts only complete products", () => {
    // Each product needs 3 pieces of 400×400; a 1000×1000 sheet fits only 4 such pieces → 1 complete product.
    const r = optimize(request([remnant()], [product({ pieces: [piece({ width: 400, height: 400, quantity: 3 })] })], 5, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(1);
    expect(r.placements).toHaveLength(3);
    expect(r.validation.valid).toBe(true);
  });

  it("avoids defect zones (with clearance)", () => {
    const rem = remnant({ width: 1000, height: 500, defects: [{ x: 480, y: 0, w: 40, h: 500 }] });
    const r = optimize(request([rem], [product({ pieces: [piece({ width: 480, height: 500 })] })], 5, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(2);
    const r2 = optimize(request([rem], [product({ pieces: [piece({ width: 480, height: 500 })] })], 5, { algorithm, constraints: { clearance: 1, edgeMargin: 0, allowRotation: true, respectGrain: true } }));
    // with 1 mm clearance each piece must keep 1 mm from the defect; 480 + 1 ≤ 480 fails → 0
    expect(r2.metrics.productsCompleted).toBe(0);
    for (const res of [r, r2]) expect(res.validation.valid).toBe(true);
  });

  it("respects clearance between pieces and edge margin", () => {
    const prod = product({ pieces: [piece({ width: 495, height: 990 })] });
    const c = { clearance: 10, edgeMargin: 0, allowRotation: false, respectGrain: true };
    // 495 + 10 + 495 = 1000 → exactly two fit
    expect(optimize(request([remnant()], [prod], 5, { algorithm, constraints: c })).metrics.productsCompleted).toBe(2);
    // with a 1 mm edge margin they no longer fit side by side
    expect(optimize(request([remnant()], [prod], 5, { algorithm, constraints: { ...c, edgeMargin: 1 } })).metrics.productsCompleted).toBe(1);
  });

  it("includes seam allowance in cut dimensions", () => {
    const r = optimize(request([remnant()], [product({ seamAllowance: 10, pieces: [piece({ width: 480, height: 480 })] })], 10, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(4);
    expect(r.placements.every((p) => p.w === 500 && p.h === 500)).toBe(true);
    expect(r.metrics.netProductArea).toBe(4 * 480 * 480);
    expect(r.metrics.usedCutArea).toBe(4 * 500 * 500);
  });

  it("respects demand limits", () => {
    const r = optimize(request([remnant()], [product()], 7, { algorithm }));
    expect(r.metrics.productsCompleted).toBe(7);
  });

  it("enforces grain alignment", () => {
    const rem = remnant({ width: 1000, height: 300, grain: "x", allowRotation: false });
    const along = product({ pieces: [piece({ width: 900, height: 200, grain: "x" })] });
    const across = product({ pieces: [piece({ width: 900, height: 200, grain: "y" })] });
    expect(optimize(request([rem], [along], 1, { algorithm })).metrics.productsCompleted).toBe(1);
    expect(optimize(request([rem], [across], 1, { algorithm })).metrics.productsCompleted).toBe(0);
  });

  it("keeps matched-fabric products on one fabric and colour", () => {
    const a = remnant({ id: "A", width: 500, height: 500, color: "#111111" });
    const b = remnant({ id: "B", width: 500, height: 500, color: "#222222" });
    const prod = product({ matchFabric: true, pieces: [piece({ width: 500, height: 500, quantity: 2 })] });
    expect(optimize(request([a, b], [prod], 1, { algorithm })).metrics.productsCompleted).toBe(0);
    expect(optimize(request([a, { ...b, color: "#111111" }], [prod], 1, { algorithm })).metrics.productsCompleted).toBe(1);
  });

  it("rejects zero-area and invalid inputs", () => {
    expect(optimize(request([remnant({ width: 0 })], [product()], 1, { algorithm })).ok).toBe(false);
    expect(optimize(request([remnant({ width: 10.5 })], [product()], 1, { algorithm })).ok).toBe(false);
    expect(optimize(request([remnant()], [product({ pieces: [piece({ width: -5 })] })], 1, { algorithm })).ok).toBe(false);
    expect(optimize(request([remnant()], [product({ pieces: [piece({ quantity: 0 })] })], 1, { algorithm })).ok).toBe(false);
    expect(optimize(request([remnant({ defects: [{ x: 0, y: 0, w: 0, h: 10 }] })], [product()], 1, { algorithm })).ok).toBe(false);
  });
});

describe("transactional complete-product allocation", () => {
  it("rolls back a product whose last piece does not fit, leaving space for later products", () => {
    // Product BIG needs 600×1000 + 600×1000 (second cannot fit on a 1000×1000 sheet).
    // If BIG's first piece were kept (no rollback), SMALL (1000×1000) could not fit.
    const big = product({ id: "BIG", pieces: [piece({ id: "a", width: 600, height: 1000, allowRotation: false }), piece({ id: "b", width: 600, height: 1000, allowRotation: false })] });
    const small = product({ id: "SMALL", pieces: [piece({ width: 1000, height: 1000 })] });
    const req = request([remnant()], [big, small], [{ productId: "BIG", max: 1, priority: false }, { productId: "SMALL", max: 1, priority: false }]);
    const problem = prepareProblem(req);
    const alloc = allocate(problem, maxRectsPlacer(problem, "bssf"), ["BIG", "SMALL"], "area");
    expect(alloc.counts).toEqual({ SMALL: 1 });
    expect(alloc.placements).toHaveLength(1);
    expect(alloc.exhausted).toContain("BIG");
    expect(validateSolution(req, alloc.placements, alloc.products).valid).toBe(true);
  });
});

describe("search", () => {
  const demo = () => {
    const rems = [remnant({ id: "A", width: 1200, height: 800, quantity: 2 }), remnant({ id: "B", width: 700, height: 450, quantity: 3, defects: [{ x: 300, y: 200, w: 50, h: 50 }] })];
    const prods = [
      product({ id: "X", pieces: [piece({ id: "a", width: 380, height: 420, quantity: 2 }), piece({ id: "b", width: 80, height: 600 })] }),
      product({ id: "Y", pieces: [piece({ id: "c", width: 210, height: 160, quantity: 2 })] }),
    ];
    return request(rems, prods, 30, { algorithm: "search", search: { seed: 7, timeLimitMs: 20_000, maxIterations: 150 } });
  };

  it("is deterministic for a fixed seed", () => {
    const a = optimize(demo());
    const b = optimize(demo());
    expect(a.placements).toEqual(b.placements);
    expect(a.score).toBe(b.score);
    expect(a.iterations).toBe(150);
  });

  it("is never worse than the MaxRects pass it includes", () => {
    const s = optimize(demo());
    const m = optimize({ ...demo(), algorithm: "maxrects", heuristic: "bssf" });
    expect(s.score).toBeGreaterThanOrEqual(m.score);
  });

  it("supports cancellation and returns the best valid intermediate result", () => {
    const req = { ...demo(), search: { seed: 7, timeLimitMs: 60_000, maxIterations: 1_000_000 } };
    const s = createOptimizationSession(req);
    s.step(30);
    s.cancel();
    expect(s.step(30)).toBe(true);
    const r = s.result();
    expect(r.cancelled).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.iterations).toBeLessThan(1_000_000);
    expect(r.validation.valid).toBe(true);
  });

  it("honours the time limit", () => {
    const req = { ...demo(), search: { seed: 7, timeLimitMs: 200, maxIterations: 10_000_000 } };
    const t = Date.now();
    const r = optimize(req);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.ok).toBe(true);
  });

  it("records real iteration snapshots with monotone best score", () => {
    const r = optimize(demo());
    const imps = r.history.filter((h) => h.kind === "improvement");
    expect(imps.length).toBeGreaterThan(0);
    for (let i = 1; i < imps.length; i++) expect(imps[i].score).toBeGreaterThan(imps[i - 1].score);
    expect(imps[imps.length - 1].score).toBeCloseTo(r.score);
    for (const s of imps) if (s.placements) expect(validateSolution(demo(), s.placements, [])).toBeDefined();
  });

  it("changes the outcome when the objective changes (products vs value)", () => {
    const rems = [remnant({ width: 1000, height: 1000 })];
    const cheapSmall = product({ id: "S", value: 1, pieces: [piece({ width: 250, height: 250 })] });
    const pricyBig = product({ id: "B", value: 100, pieces: [piece({ width: 1000, height: 1000 })] });
    const base = request(rems, [cheapSmall, pricyBig], [{ productId: "S", max: 16, priority: false }, { productId: "B", max: 1, priority: false }], { algorithm: "search", search: { seed: 3, timeLimitMs: 10000, maxIterations: 200 } });
    const byCount = optimize({ ...base, objective: "products" });
    const byValue = optimize({ ...base, objective: "value" });
    expect(byCount.productCounts).toEqual({ S: 16 });
    expect(byValue.productCounts).toEqual({ B: 1 });
  });
});
