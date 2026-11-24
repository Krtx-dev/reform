import type { ProductTemplate } from "@/core/domain/types";

/**
 * Pattern sheet: every required piece drawn at true relative scale, finished size (solid)
 * inside the cut size including seam allowance (dashed). Copies are stacked.
 */
export function PatternPreview({ p, className }: { p: Pick<ProductTemplate, "pieces" | "seamAllowance">; className?: string }) {
  const sa = p.seamAllowance;
  const gap = 40;
  const items: { x: number; y: number; w: number; h: number; name: string; grain: string; q: number; approx?: boolean }[] = [];
  let x = 0;
  let maxH = 0;
  const rowW = Math.max(900, ...p.pieces.map((q) => q.width + 2 * sa));
  let y = 0;
  for (const piece of p.pieces) {
    const w = piece.width + 2 * sa;
    const h = piece.height + 2 * sa;
    if (x > 0 && x + w > rowW) {
      x = 0;
      y += maxH + gap + 30;
      maxH = 0;
    }
    items.push({ x, y, w, h, name: piece.name, grain: piece.grain, q: piece.quantity, approx: piece.approximated });
    x += w + gap;
    maxH = Math.max(maxH, h);
  }
  const W = Math.max(...items.map((i) => i.x + i.w), 100);
  const H = y + maxH;
  const s = Math.max(W, H) / 100;
  if (items.length === 0) return <div className={className} />;
  return (
    <svg viewBox={`${-s * 4} ${-s * 8} ${W + s * 8} ${H + s * 12}`} className={className} role="img" aria-label={`Pattern with ${p.pieces.length} piece types`}>
      {items.map((it, i) => (
        <g key={i} transform={`translate(${it.x} ${it.y})`}>
          {it.q > 1 && <rect x={s * 2} y={-s * 2} width={it.w} height={it.h} fill="none" stroke="var(--line-strong)" strokeWidth={s * 0.35} />}
          <rect width={it.w} height={it.h} fill="var(--surface)" stroke="var(--ink)" strokeWidth={s * 0.35} strokeDasharray={`${s * 1.4} ${s * 0.9}`} />
          <rect x={sa} y={sa} width={it.w - 2 * sa} height={it.h - 2 * sa} fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth={s * 0.45} />
          {it.grain !== "none" && (
            <path
              d={it.grain === "y" ? `M${it.w / 2} ${it.h * 0.25} V${it.h * 0.75} m${-s * 1.6} ${-s * 2.4} l${s * 1.6} ${s * 2.4} l${s * 1.6} ${-s * 2.4}` : `M${it.w * 0.25} ${it.h / 2} H${it.w * 0.75} m${-s * 2.4} ${-s * 1.6} l${s * 2.4} ${s * 1.6} l${-s * 2.4} ${s * 1.6}`}
              stroke="var(--primary)"
              strokeWidth={s * 0.45}
              fill="none"
            />
          )}
          <text x={0} y={-s * 1.6} fontSize={s * 3.2} fill="var(--ink)" fontFamily="var(--font-geist-mono)">
            {it.name}{it.q > 1 ? ` ×${it.q}` : ""}{it.approx ? " ≈" : ""}
          </text>
        </g>
      ))}
    </svg>
  );
}
