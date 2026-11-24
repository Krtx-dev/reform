import type { CompletedProduct, FabricBreakdown, FabricType, ImpactMetrics, MaterialInstance, Placement, ProductBreakdown } from "../domain/types";
import { massKg } from "../domain/units";
import { intersection, unionArea } from "../geometry/rect";
import type { PreparedProblem } from "../optimization/prepare";

export interface BaseAreas {
  totalArea: number;
  eligibleArea: number;
  defectArea: number;
  eligibleUsableArea: number;
  eligibleIds: Set<string>;
  usableById: Map<string, number>;
}

/** Defect area inside an instance (union of defect rectangles clipped to the instance). */
export function instanceDefectArea(inst: Pick<MaterialInstance, "width" | "height" | "defects">): number {
  const bounds = { x: 0, y: 0, w: inst.width, h: inst.height };
  const clipped = inst.defects.map((d) => intersection(bounds, d)).filter((r): r is NonNullable<typeof r> => r !== null);
  return unionArea(clipped);
}

/** Areas that do not depend on placements. An instance is eligible when at least one demanded product accepts its fabric. */
export function baseAreas(problem: PreparedProblem): BaseAreas {
  const eligibleIds = new Set<string>();
  for (const p of problem.products.values()) for (const id of p.compatible) eligibleIds.add(id);
  let totalArea = 0;
  let eligibleArea = 0;
  let defectArea = 0;
  const usableById = new Map<string, number>();
  for (const inst of problem.instances) {
    const a = inst.width * inst.height;
    totalArea += a;
    const d = instanceDefectArea(inst);
    usableById.set(inst.id, a - d);
    if (eligibleIds.has(inst.id)) {
      eligibleArea += a;
      defectArea += d;
    }
  }
  return { totalArea, eligibleArea, defectArea, eligibleUsableArea: eligibleArea - defectArea, eligibleIds, usableById };
}

export function computeMetrics(problem: PreparedProblem, placements: Placement[], products: CompletedProduct[], base = baseAreas(problem)): ImpactMetrics {
  // Only pieces belonging to complete products count.
  const completeUnits = new Set(products.map((p) => p.unitId));
  const counted = placements.filter((p) => completeUnits.has(p.unitId));

  let usedCutArea = 0;
  let netProductArea = 0;
  let massKnownArea = 0;
  let mass = 0;
  let costKnownArea = 0;
  let cost = 0;
  const used = new Set<string>();
  const fabric = new Map<FabricType, FabricBreakdown>();
  const getFab = (t: FabricType) => {
    let f = fabric.get(t);
    if (!f) {
      f = { fabricType: t, availableArea: 0, usableArea: 0, usedArea: 0, massKg: null };
      fabric.set(t, f);
    }
    return f;
  };
  for (const inst of problem.instances) {
    if (!base.eligibleIds.has(inst.id)) continue;
    const f = getFab(inst.fabricType);
    f.availableArea += inst.width * inst.height;
    f.usableArea += base.usableById.get(inst.id) ?? 0;
  }
  for (const p of counted) {
    const inst = problem.instanceById.get(p.instanceId);
    if (!inst) continue;
    const a = p.w * p.h;
    usedCutArea += a;
    netProductArea += p.netArea;
    used.add(inst.id);
    const f = getFab(inst.fabricType);
    f.usedArea += a;
    if (inst.gsm != null && inst.gsm > 0) {
      const m = massKg(a, inst.gsm);
      mass += m;
      massKnownArea += a;
      f.massKg = (f.massKg ?? 0) + m;
    }
    if (inst.costPerMm2 != null) {
      cost += a * inst.costPerMm2;
      costKnownArea += a;
    }
  }

  let eligibleMass = 0;
  let eligibleMassKnown = false;
  for (const inst of problem.instances) {
    if (!base.eligibleIds.has(inst.id) || inst.gsm == null || inst.gsm <= 0) continue;
    eligibleMass += massKg(base.usableById.get(inst.id) ?? 0, inst.gsm);
    eligibleMassKnown = true;
  }

  const byProduct: ProductBreakdown[] = [];
  for (const d of problem.demand) {
    const prod = problem.products.get(d.productId);
    if (!prod) continue;
    const units = products.filter((p) => p.productId === d.productId).length;
    byProduct.push({
      productId: d.productId,
      productName: prod.template.name,
      units,
      demanded: d.max,
      cutArea: units * prod.cutArea,
      value: units * prod.template.value,
    });
  }

  const denom = base.eligibleUsableArea;
  return {
    totalArea: base.totalArea,
    eligibleArea: base.eligibleArea,
    defectArea: base.defectArea,
    eligibleUsableArea: denom,
    usedCutArea,
    netProductArea,
    unallocatedArea: Math.max(0, denom - usedCutArea),
    utilization: denom > 0 ? usedCutArea / denom : 0,
    productsCompleted: products.length,
    productionValue: byProduct.reduce((s, p) => s + p.value, 0),
    allocatedMassKg: massKnownArea > 0 ? mass : null,
    massCoverage: usedCutArea > 0 ? massKnownArea / usedCutArea : 0,
    eligibleMassKg: eligibleMassKnown ? eligibleMass : null,
    replacementValue: costKnownArea > 0 ? cost : null,
    costCoverage: usedCutArea > 0 ? costKnownArea / usedCutArea : 0,
    instancesUsed: used.size,
    byFabric: Array.from(fabric.values()).sort((a, b) => b.availableArea - a.availableArea),
    byProduct,
  };
}
