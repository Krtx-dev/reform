/**
 * Lightweight, dependency-free computer-vision helpers for the scanner.
 * Pure functions on plain arrays — testable in Node and fast enough for ≤ 800 px images.
 * All results are ESTIMATES; physical scale always comes from user calibration.
 */
import type { Point, Rect } from "../domain/types";
import { pointInPolygon, polygonArea } from "../geometry/rect";

/** Otsu threshold of an 8-bit grayscale array. */
export function otsu(gray: Uint8ClampedArray | number[]): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const g = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < g.length; i++) g[i] = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) | 0;
  return g;
}

/**
 * Segment the object containing the image centre from a contrasting background.
 * Returns the binary mask of the connected component (4-connectivity) or null.
 */
export function segmentCenter(gray: Uint8ClampedArray, w: number, h: number): Uint8Array | null {
  const t = otsu(gray);
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const centerDark = gray[cy * w + cx] <= t;
  const fg = (i: number) => (gray[i] <= t) === centerDark;
  const mask = new Uint8Array(w * h);
  const stack = [cy * w + cx];
  mask[cy * w + cx] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const x = i % w, y = (i - x) / w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) if (j >= 0 && !mask[j] && fg(j)) { mask[j] = 1; stack.push(j); }
  }
  // Reject degenerate results: tiny blobs or blobs touching most of the frame (background picked).
  if (count < w * h * 0.02 || count > w * h * 0.97) return null;
  return mask;
}

/** Monotone-chain convex hull. */
export function convexHull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Boundary pixels of a mask (pixels with a background 4-neighbour). */
export function maskBoundary(mask: Uint8Array, w: number, h: number): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) out.push({ x, y });
    }
  return out;
}

/** Reduce a closed polygon to at most `max` vertices by repeatedly removing the least significant vertex. */
export function simplifyPolygon(poly: Point[], max = 10): Point[] {
  const p = [...poly];
  const tri = (a: Point, b: Point, c: Point) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  while (p.length > max) {
    let bi = 0, bv = Infinity;
    for (let i = 0; i < p.length; i++) {
      const v = tri(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]);
      if (v < bv) { bv = v; bi = i; }
    }
    p.splice(bi, 1);
  }
  return p;
}

// ── Homography (perspective correction) ──

/** Solve A·x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export type Homography = number[]; // 3x3 row-major, h33 = 1

/** Homography mapping 4 source points to 4 destination points. */
export function homography(src: Point[], dst: Point[]): Homography | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

export function applyH(H: Homography, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

// ── Measurement ──

/** Largest axis-aligned rectangle inside a polygon, sampled on a `step` mm grid (conservative). */
export function largestInscribedRect(poly: Point[], step = 5): Rect | null {
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const cols = Math.floor((Math.max(...xs) - x0) / step);
  const rows = Math.floor((Math.max(...ys) - y0) / step);
  if (cols <= 0 || rows <= 0 || cols * rows > 400_000) return null;
  // cell (c, r) is inside when all 4 corners are inside the polygon (conservative)
  const corner = new Uint8Array((cols + 1) * (rows + 1));
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) corner[r * (cols + 1) + c] = pointInPolygon({ x: x0 + c * step, y: y0 + r * step }, poly) ? 1 : 0;
  const heights = new Array(cols).fill(0);
  let best: Rect | null = null;
  let bestA = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = (cc: number, rr: number) => corner[rr * (cols + 1) + cc];
      const inside = k(c, r) && k(c + 1, r) && k(c, r + 1) && k(c + 1, r + 1);
      heights[c] = inside ? heights[c] + 1 : 0;
    }
    // largest rectangle in histogram
    const st: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const hgt = c === cols ? 0 : heights[c];
      while (st.length && heights[st[st.length - 1]] >= hgt) {
        const top = st.pop()!;
        const height = heights[top];
        const left = st.length ? st[st.length - 1] + 1 : 0;
        const width = c - left;
        if (width * height > bestA) {
          bestA = width * height;
          best = { x: x0 + left * step, y: y0 + (r - height + 1) * step, w: width * step, h: height * step };
        }
      }
      st.push(c);
    }
  }
  return best;
}

export interface Measurement {
  polygonMm: Point[];
  areaMm2: number;
  bbox: Rect;
  inscribed: Rect | null;
}

export function measure(polyMm: Point[]): Measurement {
  const xs = polyMm.map((p) => p.x), ys = polyMm.map((p) => p.y);
  const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return { polygonMm: polyMm, areaMm2: polygonArea(polyMm), bbox, inscribed: largestInscribedRect(polyMm) };
}
