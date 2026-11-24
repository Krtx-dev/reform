import type { MaterialInstance, OptimizationConstraints, Rect } from "../domain/types";
import { intersection } from "../geometry/rect";

/**
 * Packing-space transform.
 *
 * Clearance c and edge margin m are handled exactly by working in an
 * "inflated" packing space:
 *   - the bin is (W − 2m + c) × (H − 2m + c), origin shifted by (m, m);
 *   - every piece is packed as (w + c) × (h + c);
 *   - every defect (dx, dy, dw, dh) becomes (dx − m, dy − m, dw + c, dh + c).
 * Non-overlap in packing space ⇔ real pieces are ≥ c apart from each other and
 * from defects, and lie inside the margin. See docs/ALGORITHMS.md.
 */
export interface BinSpace {
  instanceId: string;
  w: number;
  h: number;
  offset: number;
  clearance: number;
  /** Blocked rectangles (inflated defects) in packing space, clipped to the bin. */
  blocked: Rect[];
}

export function binSpace(inst: MaterialInstance, c: OptimizationConstraints): BinSpace | null {
  const m = c.edgeMargin;
  const k = c.clearance;
  const w = inst.width - 2 * m + k;
  const h = inst.height - 2 * m + k;
  if (w <= k || h <= k) return null;
  const bin: Rect = { x: 0, y: 0, w, h };
  const blocked: Rect[] = [];
  for (const d of inst.defects) {
    const r = intersection(bin, { x: d.x - m, y: d.y - m, w: d.w + k, h: d.h + k });
    if (r) blocked.push(r);
  }
  return { instanceId: inst.id, w, h, offset: m, clearance: k, blocked };
}
