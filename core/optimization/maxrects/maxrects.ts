import type { MaxRectsHeuristic, Rect } from "../../domain/types";
import { contains, intersects } from "../../geometry/rect";

/**
 * MaxRects free-space bookkeeping (Jylänki, "A Thousand Ways to Pack the Bin", 2010).
 * Free space is represented as a list of maximal, possibly overlapping, free rectangles.
 * All functions are pure: they return new arrays and never mutate inputs.
 */

/** Split every free rectangle that intersects `used` into up to four maximal remainders, then prune. */
export function splitFree(free: readonly Rect[], used: Rect): Rect[] {
  const out: Rect[] = [];
  for (const fr of free) {
    if (!intersects(fr, used)) {
      out.push(fr);
      continue;
    }
    if (used.x > fr.x) out.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
    if (used.x + used.w < fr.x + fr.w)
      out.push({ x: used.x + used.w, y: fr.y, w: fr.x + fr.w - (used.x + used.w), h: fr.h });
    if (used.y > fr.y) out.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
    if (used.y + used.h < fr.y + fr.h)
      out.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: fr.y + fr.h - (used.y + used.h) });
  }
  return pruneContained(out);
}

/** Remove free rectangles fully contained in another (keeps one of exact duplicates). */
export function pruneContained(rects: Rect[]): Rect[] {
  const n = rects.length;
  const dead = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (dead[i]) continue;
    for (let j = 0; j < n; j++) {
      if (i === j || dead[j]) continue;
      if (contains(rects[j], rects[i])) {
        // i is inside j. For exact duplicates keep the lower index.
        const dup = rects[i].x === rects[j].x && rects[i].y === rects[j].y && rects[i].w === rects[j].w && rects[i].h === rects[j].h;
        if (!dup || i > j) {
          dead[i] = 1;
          break;
        }
      }
    }
  }
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) if (!dead[i]) out.push(rects[i]);
  return out;
}

export function initialFree(w: number, h: number, blocked: readonly Rect[]): Rect[] {
  let free: Rect[] = [{ x: 0, y: 0, w, h }];
  for (const b of blocked) free = splitFree(free, b);
  return free;
}

/**
 * Score placing a w×h rectangle at the top-left of free rect `fr`. Lower is better.
 * Returns null when it does not fit.
 */
export function scoreFit(fr: Rect, w: number, h: number, heuristic: MaxRectsHeuristic): [number, number] | null {
  if (w > fr.w || h > fr.h) return null;
  const leftoverH = fr.w - w;
  const leftoverV = fr.h - h;
  const shortSide = Math.min(leftoverH, leftoverV);
  const longSide = Math.max(leftoverH, leftoverV);
  switch (heuristic) {
    case "bssf":
      return [shortSide, longSide];
    case "blsf":
      return [longSide, shortSide];
    case "baf":
      return [fr.w * fr.h - w * h, shortSide];
    case "bl":
      return [fr.y + h, fr.x];
  }
}

export const HEURISTIC_LABELS: Record<MaxRectsHeuristic, string> = {
  bssf: "Best Short Side Fit",
  baf: "Best Area Fit",
  bl: "Bottom-Left",
  blsf: "Best Long Side Fit",
};
