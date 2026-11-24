import type { AlgorithmId, DemandLine, MaterialRemnant, OptimizationRequest, PatternPiece, ProductTemplate } from "@/core/domain/types";

let n = 0;
export function remnant(p: Partial<MaterialRemnant> = {}): MaterialRemnant {
  n++;
  return {
    id: p.id ?? `M${n}`,
    name: p.name ?? `Material ${n}`,
    fabricType: "cotton",
    color: "#aaaaaa",
    colorName: "",
    width: 1000,
    height: 1000,
    condition: "good",
    quantity: 1,
    reserved: 0,
    consumed: 0,
    batchId: "",
    grain: "none",
    allowRotation: true,
    defects: [],
    location: "",
    notes: "",
    source: "manual",
    createdAt: 0,
    ...p,
  };
}

export function piece(p: Partial<PatternPiece> = {}): PatternPiece {
  return { id: p.id ?? "a", name: p.name ?? "Piece", width: 100, height: 100, quantity: 1, grain: "none", allowRotation: true, ...p };
}

export function product(p: Partial<ProductTemplate> = {}): ProductTemplate {
  return {
    id: p.id ?? "P",
    name: p.name ?? "Product",
    description: "",
    category: "",
    pieces: [piece()],
    seamAllowance: 0,
    allowedFabrics: ["cotton"],
    matchFabric: false,
    preferredColors: [],
    value: 1,
    assemblyNotes: "",
    builtin: false,
    createdAt: 0,
    ...p,
  };
}

export function request(remnants: MaterialRemnant[], products: ProductTemplate[], demand: DemandLine[] | number, o: Partial<OptimizationRequest> & { algorithm?: AlgorithmId } = {}): OptimizationRequest {
  const d = typeof demand === "number" ? products.map((p) => ({ productId: p.id, max: demand, priority: false })) : demand;
  return {
    remnants,
    products,
    demand: d,
    constraints: { clearance: 0, edgeMargin: 0, allowRotation: true, respectGrain: true, ...(o.constraints ?? {}) },
    objective: o.objective ?? "material",
    algorithm: o.algorithm ?? "maxrects",
    heuristic: o.heuristic,
    search: { seed: 1, timeLimitMs: 5000, maxIterations: 120, ...(o.search ?? {}) },
  };
}

export const ALL_ALGOS: AlgorithmId[] = ["shelf", "maxrects", "search"];
