import type { Rect } from "../domain/types";

export function area(r: Rect): number {
  return r.w * r.h;
}

/** True when the interiors of a and b overlap. Edge-touching rectangles do NOT intersect. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** True when a and b are separated by at least `gap` on some axis. */
export function separated(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

/** True when `inner` lies fully inside `outer` (edges may coincide). */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

export function rotate90(r: { w: number; h: number }): { w: number; h: number } {
  return { w: r.h, h: r.w };
}

export function isValidRect(r: Rect): boolean {
  return (
    [r.x, r.y, r.w, r.h].every((v) => Number.isFinite(v)) && r.w > 0 && r.h > 0
  );
}

/** Exact area of the union of rectangles via coordinate compression. O(n³) — fine for defect lists. */
export function unionArea(rects: Rect[]): number {
  const rs = rects.filter((r) => r.w > 0 && r.h > 0);
  if (rs.length === 0) return 0;
  const xs = Array.from(new Set(rs.flatMap((r) => [r.x, r.x + r.w]))).sort((a, b) => a - b);
  const ys = Array.from(new Set(rs.flatMap((r) => [r.y, r.y + r.h]))).sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rs.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) {
        total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return total;
}

/** World ↔ screen transform for a view with uniform scale and translation. */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

export function worldToScreen(t: ViewTransform, p: { x: number; y: number }) {
  return { x: p.x * t.scale + t.tx, y: p.y * t.scale + t.ty };
}

export function screenToWorld(t: ViewTransform, p: { x: number; y: number }) {
  return { x: (p.x - t.tx) / t.scale, y: (p.y - t.ty) / t.scale };
}

/** Zoom by `factor` keeping the screen point `anchor` fixed. */
export function zoomAround(t: ViewTransform, anchor: { x: number; y: number }, factor: number, min = 0.01, max = 50): ViewTransform {
  const scale = Math.min(max, Math.max(min, t.scale * factor));
  const world = screenToWorld(t, anchor);
  return { scale, tx: anchor.x - world.x * scale, ty: anchor.y - world.y * scale };
}

/** Transform that fits `content` inside a viewport with padding. */
export function fitTransform(content: Rect, viewW: number, viewH: number, pad = 40): ViewTransform {
  if (content.w <= 0 || content.h <= 0 || viewW <= 0 || viewH <= 0) return { scale: 1, tx: 0, ty: 0 };
  const scale = Math.min((viewW - 2 * pad) / content.w, (viewH - 2 * pad) / content.h);
  const s = scale > 0 ? scale : 0.01;
  return {
    scale: s,
    tx: (viewW - content.w * s) / 2 - content.x * s,
    ty: (viewH - content.h * s) / 2 - content.y * s,
  };
}

/** Polygon area via the shoelace formula (absolute value). */
export function polygonArea(pts: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function pointInPolygon(p: { x: number; y: number }, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const o = (p: typeof a, q: typeof a, r: typeof a) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** True when the axis-aligned rectangle lies entirely inside the (simple) polygon. */
export function rectInsidePolygon(r: Rect, pts: { x: number; y: number }[]): boolean {
  if (pts.length < 3) return false;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  if (!corners.every((c) => pointInPolygon(c, pts))) return false;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < pts.length; j++) {
      if (segmentsCross(corners[i], corners[(i + 1) % 4], pts[j], pts[(j + 1) % pts.length])) return false;
    }
  }
  return true;
}
