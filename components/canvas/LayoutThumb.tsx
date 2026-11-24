"use client";

import { useMemo } from "react";
import type { MaterialInstance, Placement } from "@/core/domain/types";
import { layoutInstances, productColorMap } from "./layout";

/** Static SVG rendering of a layout (thumbnails, reports). Draws real placement geometry. */
export function LayoutThumb({ instances, placements, productIds, usedOnly = true, className, label }: { instances: MaterialInstance[]; placements: Placement[]; productIds: string[]; usedOnly?: boolean; className?: string; label?: string }) {
  const used = useMemo(() => new Set(placements.map((p) => p.instanceId)), [placements]);
  const shown = useMemo(() => (usedOnly ? instances.filter((i) => used.has(i.id)) : instances), [instances, used, usedOnly]);
  const layout = useMemo(() => layoutInstances(shown, 60), [shown]);
  const colors = useMemo(() => productColorMap(productIds), [productIds]);
  const b = layout.bounds;
  if (shown.length === 0) return <div className={className} />;
  return (
    <svg viewBox={`${b.x} ${b.y + 40} ${b.w} ${b.h - 40}`} className={className} role="img" aria-label={label ?? `Cutting layout across ${shown.length} material pieces with ${placements.length} cut pieces`}>
      {shown.map((inst) => {
        const o = layout.pos.get(inst.id)!;
        return (
          <g key={inst.id} transform={`translate(${o.x} ${o.y})`}>
            <rect width={inst.width} height={inst.height} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={b.w / 500} />
            {inst.defects.map((d, i) => (
              <rect key={i} x={d.x} y={d.y} width={d.w} height={d.h} fill="var(--err)" opacity={0.35} />
            ))}
          </g>
        );
      })}
      {placements.map((p) => {
        const o = layout.pos.get(p.instanceId);
        if (!o) return null;
        return <rect key={p.id} x={o.x + p.x} y={o.y + p.y} width={p.w} height={p.h} fill={colors.get(p.productId)} stroke="rgba(0,0,0,0.3)" strokeWidth={b.w / 900} />;
      })}
    </svg>
  );
}
