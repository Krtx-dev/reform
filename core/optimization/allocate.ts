import type { CompletedProduct, Placement } from "../domain/types";
import type { Placer } from "./placers";
import type { CutPiece, PreparedProblem } from "./prepare";

export type PieceOrder = "area" | "longside" | "height";

export interface Allocation {
  placements: Placement[];
  products: CompletedProduct[];
  counts: Record<string, number>;
  usedCutArea: number;
  netArea: number;
  value: number;
  priorityUnits: number;
  /** Products whose next unit failed to fit (allocation stopped for them). */
  exhausted: string[];
}

const sorters: Record<PieceOrder, (a: CutPiece, b: CutPiece) => number> = {
  area: (a, b) => b.cw * b.ch - a.cw * a.ch || Math.max(b.cw, b.ch) - Math.max(a.cw, a.ch),
  longside: (a, b) => Math.max(b.cw, b.ch) - Math.max(a.cw, a.ch) || b.cw * b.ch - a.cw * a.ch,
  height: (a, b) => Math.min(b.cw, b.ch) - Math.min(a.cw, a.ch) || b.cw * b.ch - a.cw * a.ch,
};

/**
 * Transactional complete-product allocation.
 *
 * For each product unit in `sequence`:
 *   1. clone the packing state (copy-on-write),
 *   2. try to place EVERY required piece into the clone,
 *   3. commit the clone only if all pieces fit; otherwise discard it (rollback).
 * A partially placed product never reaches the output.
 * Once a unit of a product fails, later units of that product are skipped.
 */
export function allocate<S>(problem: PreparedProblem, placer: Placer<S>, sequence: readonly string[], pieceOrder: PieceOrder): Allocation {
  let state = placer.init();
  const placements: Placement[] = [];
  const products: CompletedProduct[] = [];
  const counts: Record<string, number> = {};
  const exhausted = new Set<string>();
  const maxById = new Map(problem.demand.map((d) => [d.productId, d.max]));
  const priority = new Set(problem.demand.filter((d) => d.priority).map((d) => d.productId));
  const sortedPieces = new Map<string, CutPiece[]>();
  let usedCutArea = 0;
  let netArea = 0;
  let value = 0;
  let priorityUnits = 0;
  let seq = 0;

  for (const pid of sequence) {
    if (exhausted.has(pid)) continue;
    const prod = problem.products.get(pid);
    if (!prod) continue;
    const done = counts[pid] ?? 0;
    if (done >= (maxById.get(pid) ?? 0)) continue;
    let pieces = sortedPieces.get(pid);
    if (!pieces) {
      pieces = [...prod.pieces].sort(sorters[pieceOrder]);
      sortedPieces.set(pid, pieces);
    }

    let committed: { state: S; placed: { piece: CutPiece; r: NonNullable<ReturnType<Placer<S>["place"]>> }[] } | null = null;
    for (const group of prod.groups) {
      if (group.length === 0) continue;
      const trial = placer.clone(state);
      const placed: { piece: CutPiece; r: NonNullable<ReturnType<Placer<S>["place"]>> }[] = [];
      let ok = true;
      for (const piece of pieces) {
        const r = placer.place(trial, piece, group, prod.preferred);
        if (!r) {
          ok = false;
          break;
        }
        placed.push({ piece, r });
      }
      if (ok) {
        committed = { state: trial, placed };
        break;
      }
      // rollback: `trial` is simply dropped
    }

    if (!committed) {
      exhausted.add(pid);
      continue;
    }
    state = committed.state;
    const n = done + 1;
    counts[pid] = n;
    const unitId = `${pid}/${n}`;
    const ids: string[] = [];
    for (const { piece, r } of committed.placed) {
      const inst = problem.instanceById.get(r.instanceId)!;
      const id = `${unitId}/${piece.key}`;
      ids.push(id);
      placements.push({
        id,
        instanceId: r.instanceId,
        remnantId: inst.remnantId,
        productId: pid,
        unitId,
        pieceId: piece.pieceId,
        pieceName: piece.pieceName,
        copyIndex: piece.copyIndex,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        rotated: r.rotated,
        netArea: piece.netArea,
        seq: seq++,
      });
      usedCutArea += r.w * r.h;
      netArea += piece.netArea;
    }
    value += prod.template.value;
    if (priority.has(pid)) priorityUnits++;
    products.push({ unitId, productId: pid, productName: prod.template.name, placementIds: ids });
  }

  return { placements, products, counts, usedCutArea, netArea, value, priorityUnits, exhausted: Array.from(exhausted) };
}
