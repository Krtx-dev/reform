import type { MaterialRemnant } from "@/core/domain/types";

/** True-proportion SVG of a remnant with its defects, grain arrow and optional contour. */
export function RemnantPreview({ r, className, showDims = true }: { r: Pick<MaterialRemnant, "width" | "height" | "color" | "defects" | "grain" | "contour">; className?: string; showDims?: boolean }) {
  const pad = Math.max(r.width, r.height) * 0.12;
  const vb = `${-pad} ${-pad} ${r.width + 2 * pad} ${r.height + 2 * pad}`;
  const s = Math.max(r.width, r.height) / 100;
  const pid = `hatch-${r.width}-${r.height}`;
  return (
    <svg viewBox={vb} className={className} role="img" aria-label={`Remnant ${r.width} by ${r.height} millimetres with ${r.defects.length} defect zones`}>
      <defs>
        <pattern id={pid} width={s * 3} height={s * 3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={s * 3} stroke="var(--err)" strokeWidth={s * 0.8} />
        </pattern>
      </defs>
      <rect width={r.width} height={r.height} fill={r.color} stroke="var(--ink)" strokeWidth={s * 0.4} opacity={0.9} />
      {r.contour && r.contour.length > 2 && <polygon points={r.contour.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--ink)" strokeDasharray={`${s * 2} ${s}`} strokeWidth={s * 0.4} />}
      {r.defects.map((d, i) => (
        <g key={i}>
          <rect x={d.x} y={d.y} width={d.w} height={d.h} fill={`url(#${pid})`} stroke="var(--err)" strokeWidth={s * 0.4} />
        </g>
      ))}
      {r.grain !== "none" && (
        <g stroke="var(--surface)" strokeWidth={s * 0.8} fill="none" opacity={0.9}>
          {r.grain === "x" ? (
            <path d={`M${r.width * 0.35} ${r.height / 2} H${r.width * 0.65} m${-s * 3} ${-s * 2} l${s * 3} ${s * 2} l${-s * 3} ${s * 2}`} />
          ) : (
            <path d={`M${r.width / 2} ${r.height * 0.35} V${r.height * 0.65} m${-s * 2} ${-s * 3} l${s * 2} ${s * 3} l${s * 2} ${-s * 3}`} />
          )}
        </g>
      )}
      {showDims && (
        <g fill="var(--muted)" fontFamily="var(--font-geist-mono)" fontSize={s * 4.2}>
          <text x={r.width / 2} y={-pad * 0.3} textAnchor="middle">{r.width}</text>
          <text x={-pad * 0.3} y={r.height / 2} textAnchor="middle" transform={`rotate(-90 ${-pad * 0.3} ${r.height / 2})`}>{r.height}</text>
        </g>
      )}
    </svg>
  );
}
