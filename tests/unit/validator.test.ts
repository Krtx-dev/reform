import { describe, expect, it } from "vitest";
import { optimize } from "@/core/optimization/engine";
import { validateSolution } from "@/core/optimization/validation/validator";
import { createRng } from "@/core/random";
import type { FabricType, MaterialRemnant, ProductTemplate } from "@/core/domain/types";
import { ALL_ALGOS, piece, product, remnant, request } from "./helpers";

describe("independent validator detects tampered solutions", () => {
  const rem = remnant({ id: "R", width: 1000, height: 600, defects: [{ x: 900, y: 500, w: 50, h: 50 }] });
  const prod = product({ id: "P", seamAllowance: 5, pieces: [piece({ id: "a", width: 190, height: 190, quantity: 2, allowRotation: false })] });
  const req = request([rem], [prod], 4, { constraints: { clearance: 3, edgeMargin: 2, allowRotation: true, respectGrain: true } });
  const good = optimize(req);

  it("accepts the optimizer's solution", () => {
    expect(good.ok).toBe(true);
    expect(validateSolution(req, good.placements, good.products).valid).toBe(true);
  });

  const tamper = (fn: (p: typeof good.placements) => void, products = good.products) => {
    const ps = good.placements.map((p) => ({ ...p }));
    fn(ps);
    return validateSolution(req, ps, products);
  };
  const failed = (r: ReturnType<typeof validateSolution>) => r.checks.filter((c) => !c.passed).map((c) => c.id);

  it("detects overlap", () => expect(failed(tamper((ps) => ((ps[1].x = ps[0].x), (ps[1].y = ps[0].y))))).toContain("overlap"));
  it("detects clearance violation", () => expect(failed(tamper((ps) => ((ps[1].x = ps[0].x + ps[0].w + 1), (ps[1].y = ps[0].y))))).toContain("overlap"));
  it("detects out-of-bounds", () => expect(failed(tamper((ps) => (ps[0].x = 1000 - 100)))).toContain("containment"));
  it("detects edge margin violation", () => expect(failed(tamper((ps) => (ps[0].x = 0)))).toContain("containment"));
  it("detects defect overlap", () => expect(failed(tamper((ps) => ((ps[0].x = 800), (ps[0].y = 400))))).toContain("defects"));
  it("detects wrong cut size (missing seam allowance)", () => expect(failed(tamper((ps) => (ps[0].w = 190)))).toContain("orientation"));
  it("detects forbidden rotation", () => expect(failed(tamper((ps) => (ps[0].rotated = true)))).toContain("orientation"));
  it("detects non-existent material instance", () => expect(failed(tamper((ps) => (ps[0].instanceId = "R:9")))).toContain("inventory"));
  it("detects incomplete products", () => {
    const r = tamper((ps) => ps.splice(0, 1));
    expect(failed(r)).toContain("completeness");
  });
  it("detects demand overrun", () => {
    const extra = { ...good.products[0], unitId: "P/99" };
    expect(failed(validateSolution({ ...req, demand: [{ productId: "P", max: good.products.length - 1, priority: false }] }, good.placements, good.products))).toContain("completeness");
    expect(extra).toBeDefined();
  });
  it("detects fabric incompatibility", () => {
    const r = validateSolution({ ...req, remnants: [{ ...rem, fabricType: "silk" }] }, good.placements, good.products);
    expect(failed(r)).toContain("fabric");
  });
});

describe("randomized property test: successful solutions never violate hard constraints", () => {
  const fabrics: FabricType[] = ["cotton", "denim", "linen", "silk"];
  const gen = (seed: number) => {
    const rng = createRng(seed);
    const rems: MaterialRemnant[] = Array.from({ length: 2 + rng.int(6) }, (_, i) =>
      remnant({
        id: `R${i}`,
        width: 100 + rng.int(1200),
        height: 100 + rng.int(900),
        quantity: 1 + rng.int(3),
        reserved: rng.next() < 0.1 ? 1 : 0,
        fabricType: rng.pick(fabrics),
        color: rng.pick(["#111111", "#222222"]),
        grain: rng.pick(["x", "y", "none"] as const),
        allowRotation: rng.next() < 0.7,
        defects: rng.next() < 0.4 ? [{ x: rng.int(80), y: rng.int(80), w: 10 + rng.int(60), h: 10 + rng.int(60) }] : [],
      }),
    );
    const prods: ProductTemplate[] = Array.from({ length: 1 + rng.int(4) }, (_, i) =>
      product({
        id: `P${i}`,
        value: 1 + rng.int(30),
        seamAllowance: rng.int(12),
        matchFabric: rng.next() < 0.3,
        allowedFabrics: fabrics.filter(() => rng.next() < 0.6).concat("cotton"),
        pieces: Array.from({ length: 1 + rng.int(3) }, (_, j) =>
          piece({ id: `p${j}`, width: 20 + rng.int(500), height: 20 + rng.int(400), quantity: 1 + rng.int(3), grain: rng.pick(["x", "y", "none"] as const), allowRotation: rng.next() < 0.7 }),
        ),
      }),
    );
    return request(rems, prods, 1 + rng.int(12), {
      constraints: { clearance: rng.int(6), edgeMargin: rng.int(10), allowRotation: rng.next() < 0.8, respectGrain: rng.next() < 0.8 },
      objective: rng.pick(["material", "products", "value", "priority", "balanced"] as const),
      search: { seed: seed, timeLimitMs: 10_000, maxIterations: 70 },
    });
  };

  for (let seed = 1; seed <= 40; seed++) {
    it(`seed ${seed}`, () => {
      const base = gen(seed);
      for (const algorithm of ALL_ALGOS) {
        const req = { ...base, algorithm };
        const r = optimize(req);
        expect(r.ok, r.error).toBe(true);
        const v = validateSolution(req, r.placements, r.products);
        expect(v.violations).toEqual([]);
        // utilization is a true fraction and areas reconcile
        expect(r.metrics.utilization).toBeGreaterThanOrEqual(0);
        expect(r.metrics.utilization).toBeLessThanOrEqual(1 + 1e-12);
        expect(r.metrics.usedCutArea).toBe(r.placements.reduce((s, p) => s + p.w * p.h, 0));
        expect(r.metrics.usedCutArea + r.metrics.unallocatedArea).toBe(r.metrics.eligibleUsableArea);
      }
    });
  }
});
