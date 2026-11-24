import type { MaterialRemnant, ProductionPlan } from "../domain/types";
import { availableQuantity } from "../optimization/prepare";

export interface ConsumptionLine {
  remnantId: string;
  name: string;
  pieces: number;
}

export type CommitOutcome =
  | { ok: true; remnants: MaterialRemnant[]; plan: ProductionPlan; consumption: ConsumptionLine[] }
  | { ok: false; reason: string };

/** Distinct material instances used by a plan, per remnant. */
export function planConsumption(plan: ProductionPlan): ConsumptionLine[] {
  const byRemnant = new Map<string, Set<string>>();
  for (const p of plan.result.placements) {
    if (!byRemnant.has(p.remnantId)) byRemnant.set(p.remnantId, new Set());
    byRemnant.get(p.remnantId)!.add(p.instanceId);
  }
  const names = new Map(plan.request.remnants.map((r) => [r.id, r.name]));
  return Array.from(byRemnant.entries()).map(([remnantId, s]) => ({ remnantId, name: names.get(remnantId) ?? remnantId, pieces: s.size }));
}

/**
 * Commit a production plan: deduct the material pieces it cuts from inventory.
 *
 * Idempotent — a plan that is already committed is refused, so repeated commits never
 * deduct twice. Refuses when the current inventory no longer contains the pieces the plan
 * was computed for (changed dimensions, defects or insufficient quantity).
 */
export function commitPlan(plan: ProductionPlan, remnants: MaterialRemnant[], at = Date.now()): CommitOutcome {
  if (plan.status === "committed") return { ok: false, reason: "This plan is already committed; inventory was deducted once and will not be deducted again." };
  if (!plan.result.ok || !plan.result.validation.valid) return { ok: false, reason: "Only validated plans can be committed." };
  const consumption = planConsumption(plan);
  const current = new Map(remnants.map((r) => [r.id, r]));
  const snapshot = new Map(plan.request.remnants.map((r) => [r.id, r]));
  for (const line of consumption) {
    const now = current.get(line.remnantId);
    const then = snapshot.get(line.remnantId);
    if (!now) return { ok: false, reason: `Material "${line.name}" no longer exists in inventory.` };
    if (then && (now.width !== then.width || now.height !== then.height || JSON.stringify(now.defects) !== JSON.stringify(then.defects)))
      return { ok: false, reason: `Material "${line.name}" changed since this plan was computed. Re-optimize before committing.` };
    // The plan may use instance indices up to its max; require that many available now.
    const maxIdx = Math.max(...plan.result.placements.filter((p) => p.remnantId === line.remnantId).map((p) => Number(p.instanceId.split(":").pop())));
    if (availableQuantity(now) < maxIdx) return { ok: false, reason: `Not enough "${line.name}" available (${availableQuantity(now)} on hand, plan needs piece #${maxIdx}).` };
  }
  const used = new Map(consumption.map((c) => [c.remnantId, c.pieces]));
  const next = remnants.map((r) => {
    const n = used.get(r.id);
    if (!n) return r;
    return { ...r, quantity: r.quantity - n, consumed: r.consumed + n };
  });
  return { ok: true, remnants: next, plan: { ...plan, status: "committed", committedAt: at }, consumption };
}
