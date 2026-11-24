import type { MaterialInstance, Rect } from "@/core/domain/types";

export interface InstanceLayout {
  pos: Map<string, { x: number; y: number }>;
  bounds: Rect;
}

/** Arrange material instances in rows (world coordinates, mm) for display. Purely visual. */
export function layoutInstances(instances: MaterialInstance[], gutter = 120): InstanceLayout {
  const pos = new Map<string, { x: number; y: number }>();
  if (instances.length === 0) return { pos, bounds: { x: 0, y: 0, w: 1000, h: 1000 } };
  const total = instances.reduce((s, i) => s + (i.width + gutter) * (i.height + gutter), 0);
  const maxW = Math.max(...instances.map((i) => i.width));
  const rowW = Math.max(maxW, Math.sqrt(total) * 1.7);
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const inst of instances) {
    if (x > 0 && x + inst.width > rowW) {
      x = 0;
      y += rowH + gutter;
      rowH = 0;
    }
    pos.set(inst.id, { x, y });
    x += inst.width + gutter;
    rowH = Math.max(rowH, inst.height);
    width = Math.max(width, x - gutter);
  }
  return { pos, bounds: { x: -40, y: -70, w: width + 80, h: y + rowH + 110 } };
}

export const PRODUCT_COLORS = ["#2f6b4c", "#c89438", "#55707a", "#8a8d55", "#b25a45", "#3d5a80", "#7f6a4f", "#5d8a7a", "#a0733d", "#4b4f45", "#9a5b6b", "#6b8f3a"];

export function productColorMap(productIds: string[]): Map<string, string> {
  return new Map(productIds.map((id, i) => [id, PRODUCT_COLORS[i % PRODUCT_COLORS.length]]));
}

export type ViewMode = "material" | "production" | "waste" | "comparison" | "technical";
