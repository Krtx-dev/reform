import type { DemandLine, FabricType, GrainAxis, MaterialRemnant, OptimizationConstraints, Rect } from "@/core/domain/types";
import { createRng } from "@/core/random";
import { DEMO_CONSTRAINTS, DEMO_INVENTORY } from "../demo/inventory";
import { DEMO_DEMAND, DEMO_PRODUCTS } from "../demo/products";

export interface BenchmarkDataset {
  id: string;
  name: string;
  description: string;
  remnants: MaterialRemnant[];
  demand: DemandLine[];
  constraints: OptimizationConstraints;
}

/**
 * Deterministic SYNTHETIC benchmark datasets. Each is generated from a fixed seed so every
 * run — in the browser, in tests and in scripts/benchmark.ts — sees identical inputs.
 * All datasets use the built-in product library (DEMO_PRODUCTS).
 */
const COLORS: Record<FabricType, string[]> = {
  cotton: ["#e8e6df", "#c4553e", "#5e7f63"],
  linen: ["#b9b19a", "#8c8670"],
  denim: ["#2c3e5c", "#3d5a80"],
  canvas: ["#d8cfb8", "#cfa349"],
  wool: ["#4b4f45"],
  felt: ["#a8432f"],
  polyester: ["#213d35"],
  silk: ["#7a2f3b"],
  jersey: ["#6d7f8f"],
  blend: ["#9fae8c"],
};

interface GenOpts {
  seed: number;
  count: number;
  fabrics: FabricType[];
  wRange: [number, number];
  hRange: [number, number];
  qtyRange: [number, number];
  defectRate?: number;
  defectsMax?: number;
  rotationForbiddenRate?: number;
  grains?: GrainAxis[];
  prefix: string;
}

function generate(o: GenOpts): MaterialRemnant[] {
  const rng = createRng(o.seed);
  const range = ([a, b]: [number, number], step = 10) => Math.round((a + rng.next() * (b - a)) / step) * step;
  const out: MaterialRemnant[] = [];
  for (let i = 0; i < o.count; i++) {
    const fabricType = rng.pick(o.fabrics);
    const width = range(o.wRange);
    const height = range(o.hRange);
    const defects: Rect[] = [];
    if (rng.next() < (o.defectRate ?? 0)) {
      const n = 1 + rng.int(o.defectsMax ?? 1);
      for (let d = 0; d < n; d++) {
        const w = 30 + rng.int(Math.max(1, Math.min(160, width / 4)));
        const h = 30 + rng.int(Math.max(1, Math.min(160, height / 4)));
        defects.push({ x: rng.int(Math.max(1, width - w)), y: rng.int(Math.max(1, height - h)), w, h });
      }
    }
    out.push({
      id: `${o.prefix}${String(i + 1).padStart(2, "0")}`,
      name: `${fabricType[0].toUpperCase()}${fabricType.slice(1)} remnant ${i + 1}`,
      fabricType,
      color: rng.pick(COLORS[fabricType]),
      colorName: "",
      width,
      height,
      gsm: { cotton: 130, linen: 190, denim: 390, canvas: 330, wool: 480, felt: 350, polyester: 200, silk: 70, jersey: 180, blend: 210 }[fabricType],
      condition: "good",
      quantity: o.qtyRange[0] + rng.int(o.qtyRange[1] - o.qtyRange[0] + 1),
      reserved: 0,
      consumed: 0,
      batchId: `${o.prefix}-BATCH`,
      grain: o.grains ? rng.pick(o.grains) : "y",
      allowRotation: rng.next() >= (o.rotationForbiddenRate ?? 0),
      defects,
      location: "",
      replacementCost: Math.round(((width * height) / 1e6) * 8 * 100) / 100,
      notes: "",
      source: "demo",
      createdAt: Date.UTC(2026, 0, 1),
    });
  }
  return out;
}

const demand = (pairs: [string, number][]): DemandLine[] => pairs.map(([productId, max]) => ({ productId, max, priority: false }));

export const BENCHMARK_DATASETS: BenchmarkDataset[] = [
  {
    id: "demo-factory",
    name: "Demonstration factory",
    description: "The built-in demo inventory and demand (14 remnant lines, 41 pieces, 8 products).",
    remnants: DEMO_INVENTORY,
    demand: DEMO_DEMAND,
    constraints: DEMO_CONSTRAINTS,
  },
  {
    id: "small-shop",
    name: "Small tailoring shop",
    description: "A dozen mid-sized cotton, linen and denim offcuts.",
    remnants: generate({ seed: 101, count: 12, fabrics: ["cotton", "linen", "denim"], wRange: [300, 900], hRange: [250, 700], qtyRange: [1, 2], prefix: "S" }),
    demand: demand([["p-pouch", 8], ["p-pencil", 8], ["p-coaster", 30], ["p-mat", 6], ["p-cushion", 3]]),
    constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true },
  },
  {
    id: "mixed",
    name: "Mixed remnant inventory",
    description: "Twenty remnants across eight fabric types with varied sizes.",
    remnants: generate({ seed: 202, count: 20, fabrics: ["cotton", "linen", "denim", "canvas", "wool", "silk", "jersey", "blend"], wRange: [200, 1300], hRange: [200, 1000], qtyRange: [1, 2], defectRate: 0.2, prefix: "M" }),
    demand: demand([["p-tote", 6], ["p-pouch", 10], ["p-cushion", 4], ["p-coaster", 40], ["p-pencil", 10], ["p-mat", 6], ["p-giftbag", 10], ["p-cloth", 12]]),
    constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true },
  },
  {
    id: "uniform",
    name: "Uniform fabric batch",
    description: "Ten identical 1000 × 800 mm canvas end-pieces.",
    remnants: [{ ...generate({ seed: 303, count: 1, fabrics: ["canvas"], wRange: [1000, 1000], hRange: [800, 800], qtyRange: [10, 10], prefix: "U" })[0], name: "Canvas end-piece" }],
    demand: demand([["p-tote", 12], ["p-coaster", 60], ["p-pencil", 20], ["p-mat", 10]]),
    constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true },
  },
  {
    id: "fragmented",
    name: "Fragmented textile inventory",
    description: "Forty small cutting-room scraps (120–450 mm).",
    remnants: generate({ seed: 404, count: 40, fabrics: ["cotton", "denim", "jersey", "felt", "canvas"], wRange: [120, 450], hRange: [120, 450], qtyRange: [1, 1], prefix: "F" }),
    demand: demand([["p-coaster", 80], ["p-pencil", 20], ["p-pouch", 12], ["p-cloth", 20]]),
    constraints: { clearance: 3, edgeMargin: 3, allowRotation: true, respectGrain: true },
  },
  {
    id: "defect-heavy",
    name: "Defect-heavy fabric batch",
    description: "Fifteen large seconds, most with 1–3 stains or holes.",
    remnants: generate({ seed: 505, count: 15, fabrics: ["linen", "cotton", "blend", "canvas"], wRange: [600, 1400], hRange: [500, 1100], qtyRange: [1, 1], defectRate: 0.9, defectsMax: 3, prefix: "D" }),
    demand: demand([["p-tote", 6], ["p-cushion", 6], ["p-mat", 10], ["p-pouch", 12], ["p-coaster", 40]]),
    constraints: { clearance: 5, edgeMargin: 5, allowRotation: true, respectGrain: true },
  },
  {
    id: "rotation-restricted",
    name: "Rotation-restricted batch",
    description: "Directional prints: 70 % of remnants forbid rotation; mixed grain directions.",
    remnants: generate({ seed: 606, count: 16, fabrics: ["cotton", "linen", "blend"], wRange: [400, 1200], hRange: [300, 900], qtyRange: [1, 2], rotationForbiddenRate: 0.7, grains: ["x", "y"], prefix: "RR" }),
    demand: demand([["p-pouch", 10], ["p-mat", 8], ["p-cushion", 4], ["p-coaster", 40], ["p-giftbag", 8]]),
    constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true },
  },
  {
    id: "high-volume",
    name: "High-volume manufacturing batch",
    description: "Thirty remnant lines, 2–4 pieces each, high demand on every product.",
    remnants: generate({ seed: 707, count: 30, fabrics: ["cotton", "linen", "denim", "canvas", "jersey", "blend", "polyester"], wRange: [400, 1500], hRange: [300, 1200], qtyRange: [2, 4], defectRate: 0.25, prefix: "H" }),
    demand: demand([["p-tote", 30], ["p-pouch", 40], ["p-cushion", 15], ["p-coaster", 150], ["p-pencil", 40], ["p-mat", 30], ["p-giftbag", 30], ["p-cloth", 40]]),
    constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true },
  },
];

export const BENCHMARK_PRODUCTS = DEMO_PRODUCTS;
