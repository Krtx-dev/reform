import { describe, expect, it } from "vitest";
import { applyH, convexHull, homography, largestInscribedRect, maskBoundary, measure, otsu, segmentCenter, simplifyPolygon } from "@/core/vision/vision";
import { rectInsidePolygon } from "@/core/geometry/rect";

describe("scanner vision helpers", () => {
  it("finds an Otsu threshold between two modes", () => {
    const g = [...Array(500).fill(30), ...Array(500).fill(200)];
    const t = otsu(g);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(200);
  });

  it("segments a dark centred rectangle on a light background and recovers its hull", () => {
    const w = 100, h = 80;
    const g = new Uint8ClampedArray(w * h).fill(230);
    for (let y = 20; y < 60; y++) for (let x = 25; x < 75; x++) g[y * w + x] = 40;
    const mask = segmentCenter(g, w, h)!;
    expect(mask).not.toBeNull();
    const hull = simplifyPolygon(convexHull(maskBoundary(mask, w, h)), 4);
    expect(hull).toHaveLength(4);
    const xs = hull.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(25);
    expect(xs[3]).toBe(74);
  });

  it("returns null when nothing is distinguishable", () => {
    expect(segmentCenter(new Uint8ClampedArray(100 * 100).fill(128), 100, 100)).toBeNull();
  });

  it("computes a homography that maps the reference corners exactly", () => {
    const src = [{ x: 10, y: 12 }, { x: 205, y: 30 }, { x: 190, y: 290 }, { x: 5, y: 260 }];
    const dst = [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 297 }, { x: 0, y: 297 }];
    const H = homography(src, dst)!;
    src.forEach((p, i) => {
      const q = applyH(H, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it("finds a conservative inscribed rectangle", () => {
    const L = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 400 }, { x: 400, y: 400 }, { x: 400, y: 1000 }, { x: 0, y: 1000 }];
    const r = largestInscribedRect(L, 10)!;
    expect(r.w * r.h).toBeGreaterThanOrEqual(1000 * 400 - 20_000);
    expect(rectInsidePolygon(r, L)).toBe(true);
    const m = measure(L);
    expect(m.areaMm2).toBe(1000 * 400 + 400 * 600);
    expect(m.bbox).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
  });
});
