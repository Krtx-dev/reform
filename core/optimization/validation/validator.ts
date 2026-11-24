import type { CompletedProduct, GrainAxis, OptimizationRequest, Placement, Rect, ValidationCheck, ValidationReport } from "../../domain/types";

/**
 * Independent solution validator.
 *
 * Deliberately re-derives everything from the raw OptimizationRequest — it does NOT use
 * the optimizer's prepared problem, free-rectangle state or orientation helper — so a bug
 * in the optimizer cannot hide itself. Every hard constraint is checked on the returned
 * placements.
 */
export function validateSolution(req: OptimizationRequest, placements: Placement[], products: CompletedProduct[]): ValidationReport {
  const c = req.constraints;
  const k = c.clearance;
  const m = c.edgeMargin;
  const violations: string[] = [];
  const checks: ValidationCheck[] = [];
  const add = (id: string, label: string, errs: string[], okDetail: string) => {
    checks.push({ id, label, passed: errs.length === 0, detail: errs.length === 0 ? okDetail : `${errs.length} violation(s): ${errs.slice(0, 3).join("; ")}` });
    violations.push(...errs);
  };

  const remnantById = new Map(req.remnants.map((r) => [r.id, r]));
  const productById = new Map(req.products.map((p) => [p.id, p]));
  const n = placements.length;

  // 1. Geometry integrity
  const geom: string[] = [];
  const ids = new Set<string>();
  for (const p of placements) {
    if (![p.x, p.y, p.w, p.h].every(Number.isInteger) || p.w <= 0 || p.h <= 0) geom.push(`${p.id}: non-integer or non-positive geometry`);
    if (ids.has(p.id)) geom.push(`${p.id}: duplicate placement id`);
    ids.add(p.id);
  }
  add("geometry", "Placement geometry is well-formed", geom, `${n} placements with positive integer geometry`);

  // 2. Material instance exists and quantity respected
  const inst: string[] = [];
  const instanceIds = new Set<string>();
  for (const p of placements) {
    const r = remnantById.get(p.remnantId);
    const idx = Number(p.instanceId.split(":").pop());
    const avail = r ? Math.max(0, r.quantity - r.reserved) : 0;
    if (!r || p.instanceId !== `${r.id}:${idx}` || !Number.isInteger(idx) || idx < 1 || idx > avail)
      inst.push(`${p.id}: material instance ${p.instanceId} not available`);
    instanceIds.add(p.instanceId);
  }
  add("inventory", "Inventory quantities respected", inst, `${instanceIds.size} material pieces used, all within available quantity`);

  // 3. Containment within usable region (edge margin)
  const cont: string[] = [];
  for (const p of placements) {
    const r = remnantById.get(p.remnantId);
    if (!r) continue;
    if (p.x < m || p.y < m || p.x + p.w > r.width - m || p.y + p.h > r.height - m) cont.push(`${p.id} outside ${r.name}`);
  }
  add("containment", "Pieces lie inside their material", cont, m > 0 ? `All pieces ≥ ${m} mm from edges` : "All pieces inside material bounds");

  // 4. No overlap (with clearance)
  const overlap: string[] = [];
  const byInstance = new Map<string, Placement[]>();
  for (const p of placements) {
    if (!byInstance.has(p.instanceId)) byInstance.set(p.instanceId, []);
    byInstance.get(p.instanceId)!.push(p);
  }
  const sep = (a: Rect, b: Rect, gap: number) =>
    a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
  for (const list of byInstance.values()) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].x >= sorted[i].x + sorted[i].w + k) break;
        if (!sep(sorted[i], sorted[j], k)) overlap.push(`${sorted[i].id} × ${sorted[j].id}`);
      }
    }
  }
  add("overlap", "No overlapping pieces", overlap, k > 0 ? `All pieces ≥ ${k} mm apart` : "No pieces overlap");

  // 5. Defect exclusion
  const defect: string[] = [];
  for (const p of placements) {
    const r = remnantById.get(p.remnantId);
    if (!r) continue;
    for (const d of r.defects) if (!sep(p, d, k)) defect.push(`${p.id} touches defect in ${r.name}`);
  }
  add("defects", "Defect zones avoided", defect, "No piece intersects a defect zone or its clearance");

  // 6. Fabric compatibility (+ matched fabric)
  const fab: string[] = [];
  for (const p of placements) {
    const r = remnantById.get(p.remnantId);
    const prod = productById.get(p.productId);
    if (!r || !prod) {
      fab.push(`${p.id}: unknown product or material`);
      continue;
    }
    if (!prod.allowedFabrics.includes(r.fabricType)) fab.push(`${p.id}: ${r.fabricType} not allowed for ${prod.name}`);
  }
  const placementById = new Map(placements.map((p) => [p.id, p]));
  for (const u of products) {
    const prod = productById.get(u.productId);
    if (!prod?.matchFabric) continue;
    const keys = new Set(
      u.placementIds.map((id) => {
        const r = remnantById.get(placementById.get(id)?.remnantId ?? "");
        return r ? `${r.fabricType}|${r.color.toLowerCase()}` : "?";
      }),
    );
    if (keys.size > 1) fab.push(`${u.unitId}: mixed fabrics in a matched-fabric product`);
  }
  add("fabric", "Fabric compatibility respected", fab, "Every piece is cut from an allowed fabric");

  // 7. Dimensions, seam allowance, rotation and grain
  const orient: string[] = [];
  const rot = (g: GrainAxis): GrainAxis => (g === "x" ? "y" : g === "y" ? "x" : "none");
  for (const p of placements) {
    const prod = productById.get(p.productId);
    const r = remnantById.get(p.remnantId);
    const piece = prod?.pieces.find((q) => q.id === p.pieceId);
    if (!prod || !r || !piece) {
      orient.push(`${p.id}: unknown piece`);
      continue;
    }
    const cw = piece.width + 2 * prod.seamAllowance;
    const ch = piece.height + 2 * prod.seamAllowance;
    const dimsOk = p.rotated ? p.w === ch && p.h === cw : p.w === cw && p.h === ch;
    if (!dimsOk) orient.push(`${p.id}: cut size ${p.w}×${p.h} ≠ required ${cw}×${ch} (incl. seam allowance)`);
    if (p.rotated && !(c.allowRotation && piece.allowRotation && r.allowRotation)) orient.push(`${p.id}: rotated but rotation is forbidden`);
    if (c.respectGrain && piece.grain !== "none" && r.grain !== "none") {
      const g = p.rotated ? rot(piece.grain) : piece.grain;
      if (g !== r.grain) orient.push(`${p.id}: grain misaligned`);
    }
  }
  add("orientation", "Cut sizes, rotation and grain respected", orient, "Seam allowances included; rotation and grain rules hold");

  // 8. Product completeness and demand limits
  const comp: string[] = [];
  const inUnit = new Set<string>();
  const unitCount = new Map<string, number>();
  for (const u of products) {
    const prod = productById.get(u.productId);
    if (!prod) {
      comp.push(`${u.unitId}: unknown product`);
      continue;
    }
    unitCount.set(u.productId, (unitCount.get(u.productId) ?? 0) + 1);
    const need = new Map(prod.pieces.map((q) => [q.id, q.quantity]));
    const have = new Map<string, number>();
    for (const id of u.placementIds) {
      const p = placementById.get(id);
      if (!p || p.unitId !== u.unitId) {
        comp.push(`${u.unitId}: missing placement ${id}`);
        continue;
      }
      inUnit.add(id);
      have.set(p.pieceId, (have.get(p.pieceId) ?? 0) + 1);
    }
    for (const [pid, q] of need) if ((have.get(pid) ?? 0) !== q) comp.push(`${u.unitId}: piece ${pid} has ${have.get(pid) ?? 0}/${q}`);
    for (const pid of have.keys()) if (!need.has(pid)) comp.push(`${u.unitId}: unexpected piece ${pid}`);
  }
  for (const p of placements) if (!inUnit.has(p.id)) comp.push(`${p.id}: orphan piece not part of a complete product`);
  for (const [pid, cnt] of unitCount) {
    const d = req.demand.find((x) => x.productId === pid);
    if (!d || cnt > d.max) comp.push(`${pid}: ${cnt} units exceeds demand ${d?.max ?? 0}`);
  }
  add("completeness", "Only complete products counted", comp, `${products.length} complete products; no partial products`);

  return { valid: violations.length === 0, checks, violations };
}
