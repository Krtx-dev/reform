import type { MaxRectsHeuristic, Rect } from "../domain/types";
import { intersects } from "../geometry/rect";
import { binSpace, type BinSpace } from "./bins";
import { initialFree, scoreFit, splitFree } from "./maxrects/maxrects";
import { orientationsFor, type CutPiece, type PreparedProblem } from "./prepare";

export interface PlacedRect {
  instanceId: string;
  /** Real remnant coordinates (mm) of the cut rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

/**
 * A placer owns per-instance free-space state. `place` mutates the given state;
 * `clone` must be cheap (copy-on-write) because complete-product allocation is
 * transactional: we clone, attempt every piece, and discard the clone on failure.
 */
export interface Placer<S> {
  id: string;
  label: string;
  init(): S;
  clone(s: S): S;
  place(s: S, piece: CutPiece, candidates: readonly string[], preferred: ReadonlySet<string>): PlacedRect | null;
}

function buildBins(problem: PreparedProblem): Map<string, BinSpace | null> {
  const bins = new Map<string, BinSpace | null>();
  for (const inst of problem.instances) bins.set(inst.id, binSpace(inst, problem.constraints));
  return bins;
}

// ───────────────────────────── MaxRects ─────────────────────────────

export interface MaxRectsState {
  free: Map<string, Rect[]>;
}

export function maxRectsPlacer(problem: PreparedProblem, heuristic: MaxRectsHeuristic): Placer<MaxRectsState> {
  const bins = buildBins(problem);
  const k = problem.constraints.clearance;
  const initial = new Map<string, Rect[]>();
  for (const [id, b] of bins) if (b) initial.set(id, initialFree(b.w, b.h, b.blocked));
  return {
    id: `maxrects-${heuristic}`,
    label: `MaxRects · ${heuristic.toUpperCase()}`,
    init: () => ({ free: new Map(initial) }),
    clone: (s) => ({ free: new Map(s.free) }),
    place(s, piece, candidates, preferred) {
      let best: { id: string; fr: Rect; w: number; h: number; rotated: boolean; key: [number, number, number] } | null = null;
      for (const id of candidates) {
        const free = s.free.get(id);
        if (!free || free.length === 0) continue;
        const inst = problem.instanceById.get(id)!;
        const orients = orientationsFor(piece, inst, problem.constraints);
        const pref = preferred.size > 0 && !preferred.has(id) ? 1 : 0;
        for (const o of orients) {
          const pw = o.w + k;
          const ph = o.h + k;
          for (const fr of free) {
            const sc = scoreFit(fr, pw, ph, heuristic);
            if (!sc) continue;
            if (
              !best ||
              pref < best.key[0] ||
              (pref === best.key[0] && (sc[0] < best.key[1] || (sc[0] === best.key[1] && sc[1] < best.key[2])))
            ) {
              best = { id, fr, w: o.w, h: o.h, rotated: o.rotated, key: [pref, sc[0], sc[1]] };
            }
          }
        }
      }
      if (!best) return null;
      const bin = bins.get(best.id)!;
      const used: Rect = { x: best.fr.x, y: best.fr.y, w: best.w + k, h: best.h + k };
      s.free.set(best.id, splitFree(s.free.get(best.id)!, used));
      return { instanceId: best.id, x: used.x + bin.offset, y: used.y + bin.offset, w: best.w, h: best.h, rotated: best.rotated };
    },
  };
}

// ───────────────────────────── Shelf (baseline) ─────────────────────────────

interface Shelf {
  y: number;
  h: number;
  x: number;
}
interface ShelfBin {
  shelves: Shelf[];
  nextY: number;
}
export interface ShelfState {
  bins: Map<string, ShelfBin>;
}

/**
 * First-Fit shelf packing — the conventional "cut in rows" baseline.
 * Pieces go into the first shelf (row) of the first material instance where they fit;
 * otherwise a new shelf is opened below the last one. Pieces are laid flat
 * (short side vertical) when rotation is permitted. A defect pushes the cursor
 * to the defect's right edge; the shelf algorithm never fills space beside or below a defect
 * inside an existing shelf.
 */
export function shelfPlacer(problem: PreparedProblem): Placer<ShelfState> {
  const bins = buildBins(problem);
  const k = problem.constraints.clearance;

  const scan = (bin: BinSpace, startX: number, y: number, pw: number, ph: number): number | null => {
    let x = startX;
    for (;;) {
      if (x + pw > bin.w || y + ph > bin.h) return null;
      const rect = { x, y, w: pw, h: ph };
      const hit = bin.blocked.find((b) => intersects(b, rect));
      if (!hit) return x;
      x = hit.x + hit.w;
    }
  };

  return {
    id: "shelf",
    label: "First-Fit Shelf",
    init: () => ({ bins: new Map() }),
    clone: (s) => ({ bins: new Map(s.bins) }),
    place(s, piece, candidates, preferred) {
      const ordered = preferred.size > 0 ? [...candidates].sort((a, b) => Number(!preferred.has(a)) - Number(!preferred.has(b))) : candidates;
      for (const id of ordered) {
        const bin = bins.get(id);
        if (!bin) continue;
        const inst = problem.instanceById.get(id)!;
        const orients = orientationsFor(piece, inst, problem.constraints).sort((a, b) => a.h - b.h);
        if (orients.length === 0) continue;
        const st = s.bins.get(id) ?? { shelves: [], nextY: 0 };
        // 1. existing shelves
        for (let si = 0; si < st.shelves.length; si++) {
          const sh = st.shelves[si];
          for (const o of orients) {
            const pw = o.w + k;
            const ph = o.h + k;
            if (ph > sh.h) continue;
            const x = scan(bin, sh.x, sh.y, pw, ph);
            if (x === null) continue;
            const shelves = st.shelves.slice();
            shelves[si] = { ...sh, x: x + pw };
            s.bins.set(id, { shelves, nextY: st.nextY });
            return { instanceId: id, x: x + bin.offset, y: sh.y + bin.offset, w: o.w, h: o.h, rotated: o.rotated };
          }
        }
        // 2. new shelf
        for (const o of orients) {
          const pw = o.w + k;
          const ph = o.h + k;
          const x = scan(bin, 0, st.nextY, pw, ph);
          if (x === null) continue;
          s.bins.set(id, { shelves: [...st.shelves, { y: st.nextY, h: ph, x: x + pw }], nextY: st.nextY + ph });
          return { instanceId: id, x: x + bin.offset, y: st.nextY + bin.offset, w: o.w, h: o.h, rotated: o.rotated };
        }
      }
      return null;
    },
  };
}
