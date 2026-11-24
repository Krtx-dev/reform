import type {
  DemandLine,
  GrainAxis,
  MaterialInstance,
  MaterialRemnant,
  OptimizationConstraints,
  OptimizationRequest,
  PatternPiece,
  ProductTemplate,
} from "../domain/types";
import { hashString } from "../random";

/** One physical cut piece required by one product (piece copy expanded). */
export interface CutPiece {
  key: string;
  productId: string;
  pieceId: string;
  pieceName: string;
  copyIndex: number;
  /** Cut dimensions (finished + 2 × seam allowance), unrotated. */
  cw: number;
  ch: number;
  grain: GrainAxis;
  allowRotation: boolean;
  netArea: number;
}

export interface PreparedProduct {
  template: ProductTemplate;
  pieces: CutPiece[];
  cutArea: number;
  /** Instance ids whose fabric is allowed for this product. */
  compatible: string[];
  /** Instance groups (same fabric+colour) when matchFabric, else a single group with all compatible instances. */
  groups: string[][];
  preferred: Set<string>;
}

export interface Orientation {
  w: number;
  h: number;
  rotated: boolean;
}

export interface PreparedProblem {
  instances: MaterialInstance[];
  instanceById: Map<string, MaterialInstance>;
  products: Map<string, PreparedProduct>;
  demand: DemandLine[];
  constraints: OptimizationConstraints;
  errors: string[];
  /** Units demanded in total (Σ max over demand lines with a known product). */
  totalDemandUnits: number;
  totalDemandValue: number;
  totalPriorityUnits: number;
}

export const MAX_DIMENSION_MM = 100_000;
export const MAX_INSTANCES = 2_000;

export function isPositiveInt(v: number, max = MAX_DIMENSION_MM) {
  return Number.isInteger(v) && v > 0 && v <= max;
}

export function availableQuantity(r: MaterialRemnant): number {
  return Math.max(0, Math.floor(r.quantity) - Math.max(0, Math.floor(r.reserved)));
}

export function expandInstances(remnants: MaterialRemnant[]): MaterialInstance[] {
  const out: MaterialInstance[] = [];
  for (const r of remnants) {
    const qty = availableQuantity(r);
    const area = r.width * r.height;
    for (let i = 0; i < qty; i++) {
      out.push({
        id: `${r.id}:${i + 1}`,
        remnantId: r.id,
        index: i + 1,
        name: r.name,
        width: r.width,
        height: r.height,
        fabricType: r.fabricType,
        color: r.color,
        grain: r.grain,
        allowRotation: r.allowRotation,
        defects: r.defects,
        gsm: r.gsm,
        costPerMm2: r.replacementCost != null && area > 0 ? r.replacementCost / area : undefined,
      });
    }
  }
  return out;
}

export function cutPieces(t: ProductTemplate): CutPiece[] {
  const out: CutPiece[] = [];
  const sa = t.seamAllowance;
  for (const p of t.pieces) {
    for (let c = 0; c < p.quantity; c++) {
      out.push({
        key: `${p.id}#${c + 1}`,
        productId: t.id,
        pieceId: p.id,
        pieceName: p.name,
        copyIndex: c + 1,
        cw: p.width + 2 * sa,
        ch: p.height + 2 * sa,
        grain: p.grain,
        allowRotation: p.allowRotation,
        netArea: p.width * p.height,
      });
    }
  }
  return out;
}

function rotateGrain(g: GrainAxis): GrainAxis {
  return g === "x" ? "y" : g === "y" ? "x" : "none";
}

/** Valid orientations of a cut piece on an instance under the constraints. */
export function orientationsFor(
  piece: Pick<CutPiece, "cw" | "ch" | "grain" | "allowRotation">,
  inst: Pick<MaterialInstance, "grain" | "allowRotation">,
  c: Pick<OptimizationConstraints, "allowRotation" | "respectGrain">,
): Orientation[] {
  const grainOk = (pieceGrain: GrainAxis) =>
    !c.respectGrain || pieceGrain === "none" || inst.grain === "none" || pieceGrain === inst.grain;
  const out: Orientation[] = [];
  if (grainOk(piece.grain)) out.push({ w: piece.cw, h: piece.ch, rotated: false });
  const canRotate = c.allowRotation && piece.allowRotation && inst.allowRotation;
  if (canRotate && grainOk(rotateGrain(piece.grain))) {
    if (!(piece.cw === piece.ch && out.length > 0)) out.push({ w: piece.ch, h: piece.cw, rotated: true });
  }
  return out;
}

function validatePiece(p: PatternPiece, product: string, errors: string[]) {
  if (!isPositiveInt(p.width) || !isPositiveInt(p.height))
    errors.push(`Product "${product}" piece "${p.name}" has invalid dimensions (${p.width}×${p.height} mm). Dimensions must be positive integers.`);
  if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 500)
    errors.push(`Product "${product}" piece "${p.name}" has invalid quantity ${p.quantity}.`);
}

export function prepareProblem(req: OptimizationRequest): PreparedProblem {
  const errors: string[] = [];
  const c = req.constraints;
  if (!Number.isInteger(c.clearance) || c.clearance < 0 || c.clearance > 500) errors.push("Cutting clearance must be an integer between 0 and 500 mm.");
  if (!Number.isInteger(c.edgeMargin) || c.edgeMargin < 0 || c.edgeMargin > 500) errors.push("Edge margin must be an integer between 0 and 500 mm.");

  const validRemnants: MaterialRemnant[] = [];
  for (const r of req.remnants) {
    if (!isPositiveInt(r.width) || !isPositiveInt(r.height)) {
      errors.push(`Material "${r.name}" has invalid dimensions (${r.width}×${r.height} mm).`);
      continue;
    }
    if (!Number.isInteger(r.quantity) || r.quantity < 0) {
      errors.push(`Material "${r.name}" has invalid quantity ${r.quantity}.`);
      continue;
    }
    const badDefect = r.defects.find(
      (d) => ![d.x, d.y, d.w, d.h].every(Number.isFinite) || d.w <= 0 || d.h <= 0,
    );
    if (badDefect) {
      errors.push(`Material "${r.name}" has an invalid defect zone.`);
      continue;
    }
    validRemnants.push(r);
  }

  const instances = expandInstances(validRemnants);
  if (instances.length > MAX_INSTANCES) errors.push(`Too many material pieces (${instances.length}); the limit is ${MAX_INSTANCES}.`);
  const instanceById = new Map(instances.map((i) => [i.id, i]));

  const products = new Map<string, PreparedProduct>();
  const demand: DemandLine[] = [];
  let totalDemandUnits = 0;
  let totalDemandValue = 0;
  let totalPriorityUnits = 0;
  const templateById = new Map(req.products.map((p) => [p.id, p]));

  for (const d of req.demand) {
    const t = templateById.get(d.productId);
    if (!t) {
      errors.push(`Demand references unknown product ${d.productId}.`);
      continue;
    }
    if (!Number.isInteger(d.max) || d.max < 0 || d.max > 1000) {
      errors.push(`Demand for "${t.name}" must be an integer between 0 and 1000.`);
      continue;
    }
    if (d.max === 0) continue;
    if (t.pieces.length === 0) {
      errors.push(`Product "${t.name}" has no pattern pieces.`);
      continue;
    }
    if (!Number.isInteger(t.seamAllowance) || t.seamAllowance < 0 || t.seamAllowance > 200)
      errors.push(`Product "${t.name}" has an invalid seam allowance.`);
    const before = errors.length;
    t.pieces.forEach((p) => validatePiece(p, t.name, errors));
    if (errors.length > before) continue;

    const pieces = cutPieces(t);
    const allowed = new Set(t.allowedFabrics);
    const compatible = instances.filter((i) => allowed.has(i.fabricType)).map((i) => i.id);
    let groups: string[][];
    if (t.matchFabric) {
      const byKey = new Map<string, string[]>();
      for (const id of compatible) {
        const inst = instanceById.get(id)!;
        const k = `${inst.fabricType}|${inst.color.toLowerCase()}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(id);
      }
      groups = Array.from(byKey.keys())
        .sort()
        .map((k) => byKey.get(k)!);
    } else {
      groups = [compatible];
    }
    const prefs = new Set(t.preferredColors.map((c) => c.toLowerCase()));
    const preferred = new Set(compatible.filter((id) => prefs.has(instanceById.get(id)!.color.toLowerCase())));
    products.set(t.id, {
      template: t,
      pieces,
      cutArea: pieces.reduce((s, p) => s + p.cw * p.ch, 0),
      compatible,
      groups,
      preferred,
    });
    demand.push({ productId: d.productId, max: d.max, priority: d.priority });
    totalDemandUnits += d.max;
    totalDemandValue += d.max * Math.max(0, t.value);
    if (d.priority) totalPriorityUnits += d.max;
  }

  return { instances, instanceById, products, demand, constraints: c, errors, totalDemandUnits, totalDemandValue, totalPriorityUnits };
}

/** Stable fingerprint of everything that influences an optimization result. */
export function requestHash(req: OptimizationRequest): string {
  const payload = {
    r: req.remnants
      .map((r) => [r.id, r.width, r.height, availableQuantity(r), r.fabricType, r.color, r.grain, r.allowRotation, r.defects, r.gsm ?? null, r.replacementCost ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    p: req.products
      .filter((p) => req.demand.some((d) => d.productId === p.id && d.max > 0))
      .map((p) => [p.id, p.pieces, p.seamAllowance, [...p.allowedFabrics].sort(), p.matchFabric, p.preferredColors, p.value])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    d: req.demand.filter((d) => d.max > 0).map((d) => [d.productId, d.max, d.priority]),
    c: req.constraints,
    o: req.objective,
    a: req.algorithm,
    h: req.heuristic ?? null,
    s: req.algorithm === "search" ? req.search : null,
  };
  return hashString(JSON.stringify(payload));
}
