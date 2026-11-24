import { describe, expect, it } from "vitest";
import { area, contains, fitTransform, intersection, intersects, isValidRect, polygonArea, rectInsidePolygon, rotate90, screenToWorld, separated, unionArea, worldToScreen, zoomAround } from "@/core/geometry/rect";
import { formatPct, fromMm, massKg, mm2ToM2, toMm } from "@/core/domain/units";
import { initialFree, pruneContained, scoreFit, splitFree } from "@/core/optimization/maxrects/maxrects";
import { binSpace } from "@/core/optimization/bins";
import { orientationsFor } from "@/core/optimization/prepare";

describe("rectangle geometry", () => {
  it("detects interior intersection", () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(false);
  });
  it("treats edge-touching rectangles as non-overlapping", () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 1, h: 1 })).toBe(false);
  });
  it("checks containment including shared edges", () => {
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 1, y: 1, w: 10, h: 5 })).toBe(false);
  });
  it("enforces clearance with separated()", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(separated(a, { x: 13, y: 0, w: 5, h: 5 }, 3)).toBe(true);
    expect(separated(a, { x: 12, y: 0, w: 5, h: 5 }, 3)).toBe(false);
  });
  it("computes intersection, area, rotation", () => {
    expect(intersection({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(intersection({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 1, w: 1, h: 1 })).toBeNull();
    expect(area({ x: 0, y: 0, w: 7, h: 3 })).toBe(21);
    expect(rotate90({ w: 7, h: 3 })).toEqual({ w: 3, h: 7 });
    expect(isValidRect({ x: 0, y: 0, w: 0, h: 3 })).toBe(false);
  });
  it("computes union area of overlapping rectangles exactly", () => {
    expect(unionArea([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }])).toBe(175);
    expect(unionArea([{ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }])).toBe(100);
    expect(unionArea([])).toBe(0);
  });
  it("polygon area and rectangle-in-polygon", () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(polygonArea(sq)).toBe(10000);
    expect(rectInsidePolygon({ x: 10, y: 10, w: 50, h: 50 }, sq)).toBe(true);
    expect(rectInsidePolygon({ x: 60, y: 10, w: 50, h: 50 }, sq)).toBe(false);
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];
    expect(rectInsidePolygon({ x: 5, y: 5, w: 90, h: 30 }, L)).toBe(true);
    expect(rectInsidePolygon({ x: 5, y: 5, w: 90, h: 90 }, L)).toBe(false);
  });
});

describe("coordinate transforms", () => {
  it("round-trips world/screen", () => {
    const t = { scale: 2.5, tx: 30, ty: -12 };
    const w = { x: 123, y: 456 };
    const s = worldToScreen(t, w);
    const back = screenToWorld(t, s);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });
  it("zooms around an anchor keeping it fixed", () => {
    const t = { scale: 1, tx: 0, ty: 0 };
    const anchor = { x: 200, y: 100 };
    const before = screenToWorld(t, anchor);
    const z = zoomAround(t, anchor, 2);
    const after = screenToWorld(z, anchor);
    expect(z.scale).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it("fits content into a viewport", () => {
    const t = fitTransform({ x: 0, y: 0, w: 1000, h: 500 }, 600, 400, 50);
    expect(t.scale).toBeCloseTo(0.5);
    expect(t.tx).toBeCloseTo(50);
  });
});

describe("units", () => {
  it("converts to integer millimetres", () => {
    expect(toMm(1.25, "m")).toBe(1250);
    expect(toMm(12.34, "cm")).toBe(123);
    expect(toMm(12.35, "cm")).toBe(124);
    expect(toMm(7, "mm")).toBe(7);
    expect(fromMm(1500, "m")).toBe(1.5);
    expect(Number.isNaN(toMm(Number.NaN, "mm"))).toBe(true);
  });
  it("converts areas and mass", () => {
    expect(mm2ToM2(1_000_000)).toBe(1);
    // 0.5 m² of 200 gsm = 100 g = 0.1 kg
    expect(massKg(500_000, 200)).toBeCloseTo(0.1);
    expect(formatPct(0.1234)).toBe("12.3%");
  });
});

describe("MaxRects free-space bookkeeping", () => {
  it("splits a free rect around a used rect and prunes containment", () => {
    const free = splitFree([{ x: 0, y: 0, w: 100, h: 100 }], { x: 0, y: 0, w: 40, h: 30 });
    expect(free).toEqual(expect.arrayContaining([{ x: 40, y: 0, w: 60, h: 100 }, { x: 0, y: 30, w: 100, h: 70 }]));
    expect(free).toHaveLength(2);
  });
  it("prunes contained and duplicate rectangles", () => {
    const r = pruneContained([{ x: 0, y: 0, w: 10, h: 10 }, { x: 1, y: 1, w: 2, h: 2 }, { x: 0, y: 0, w: 10, h: 10 }]);
    expect(r).toEqual([{ x: 0, y: 0, w: 10, h: 10 }]);
  });
  it("blocks defects from the initial free list", () => {
    const free = initialFree(100, 100, [{ x: 40, y: 40, w: 20, h: 20 }]);
    for (const f of free) expect(intersects(f, { x: 40, y: 40, w: 20, h: 20 })).toBe(false);
    expect(free.length).toBe(4);
  });
  it("scores fits per heuristic and rejects non-fits", () => {
    const fr = { x: 0, y: 0, w: 100, h: 50 };
    expect(scoreFit(fr, 101, 10, "bssf")).toBeNull();
    expect(scoreFit(fr, 90, 50, "bssf")).toEqual([0, 10]);
    expect(scoreFit(fr, 90, 50, "baf")).toEqual([500, 0]);
    expect(scoreFit({ x: 5, y: 7, w: 100, h: 50 }, 10, 10, "bl")).toEqual([17, 5]);
  });
  it("inflates bins and defects for clearance and margin", () => {
    const b = binSpace({ id: "i", remnantId: "r", index: 1, name: "", width: 1000, height: 500, fabricType: "cotton", color: "#000000", grain: "none", allowRotation: true, defects: [{ x: 100, y: 100, w: 10, h: 10 }] }, { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true });
    expect(b).not.toBeNull();
    expect(b!.w).toBe(1000 - 10 + 4);
    expect(b!.blocked[0]).toEqual({ x: 95, y: 95, w: 14, h: 14 });
  });
});

describe("orientation rules", () => {
  const C = { allowRotation: true, respectGrain: true };
  it("allows both orientations for grain-free pieces", () => {
    expect(orientationsFor({ cw: 100, ch: 50, grain: "none", allowRotation: true }, { grain: "y", allowRotation: true }, C)).toHaveLength(2);
  });
  it("dedupes square pieces", () => {
    expect(orientationsFor({ cw: 50, ch: 50, grain: "none", allowRotation: true }, { grain: "none", allowRotation: true }, C)).toHaveLength(1);
  });
  it("forces grain alignment", () => {
    const o = orientationsFor({ cw: 100, ch: 50, grain: "y", allowRotation: true }, { grain: "x", allowRotation: true }, C);
    expect(o).toEqual([{ w: 50, h: 100, rotated: true }]);
  });
  it("returns nothing when grain mismatches and rotation is forbidden", () => {
    expect(orientationsFor({ cw: 100, ch: 50, grain: "y", allowRotation: true }, { grain: "x", allowRotation: false }, C)).toEqual([]);
  });
  it("ignores grain when respectGrain is off", () => {
    expect(orientationsFor({ cw: 100, ch: 50, grain: "y", allowRotation: false }, { grain: "x", allowRotation: false }, { allowRotation: true, respectGrain: false })).toHaveLength(1);
  });
});
