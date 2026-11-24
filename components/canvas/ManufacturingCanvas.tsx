"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Shape, Stage, Text, Arrow } from "react-konva";
import type Konva from "konva";
import type { MaterialInstance, Placement, ProductTemplate } from "@/core/domain/types";
import { screenToWorld, zoomAround, type ViewTransform } from "@/core/geometry/rect";
import type { InstanceLayout, ViewMode } from "./layout";

export interface HoverInfo {
  kind: "piece" | "instance";
  id: string;
  screen: { x: number; y: number };
}

export interface CanvasProps {
  width: number;
  height: number;
  instances: MaterialInstance[];
  placements: Placement[];
  products: ProductTemplate[];
  layout: InstanceLayout;
  mode: ViewMode;
  colors: Map<string, string>;
  clearance: number;
  transform: ViewTransform;
  onTransform: (t: ViewTransform) => void;
  selectedId: string | null;
  onSelect: (id: string | null, kind: "piece" | "instance" | null) => void;
  onHover?: (h: HoverInfo | null) => void;
  onCursor?: (world: { x: number; y: number } | null) => void;
  highlight?: Set<string>;
  dim?: boolean;
  animate?: boolean;
  caption?: string;
  showRulers?: boolean;
  usedOnly?: boolean;
}

const RULER = 22;

function useCssVar(name: string, fallback: string) {
  const [v, setV] = useState(fallback);
  useEffect(() => {
    const read = () => setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [name, fallback]);
  return v;
}

function tickStep(scale: number) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  return steps.find((s) => s * scale >= 64) ?? 10000;
}

/** Hatched rectangle (defects / waste). Drawn in world units. */
function Hatch({ x, y, w, h, color, spacing, strokeWidth, fill }: { x: number; y: number; w: number; h: number; color: string; spacing: number; strokeWidth: number; fill?: string }) {
  return (
    <Shape
      x={x}
      y={y}
      listening={false}
      sceneFunc={(ctx, shape) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        ctx.clip();
        ctx.beginPath();
        for (let d = -h; d < w; d += spacing) {
          ctx.moveTo(d, h);
          ctx.lineTo(d + h, 0);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
        ctx.restore();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

const Piece = memo(function Piece({
  p,
  ox,
  oy,
  fill,
  stroke,
  label,
  sub,
  scale,
  mode,
  selected,
  highlighted,
  grain,
  clearance,
  animate,
  mono,
  ink,
  onSelect,
  onHover,
}: {
  p: Placement;
  ox: number;
  oy: number;
  fill: string;
  stroke: string;
  label: string;
  sub: string;
  scale: number;
  mode: ViewMode;
  selected: boolean;
  highlighted: boolean;
  grain: MaterialInstance["grain"];
  clearance: number;
  animate: boolean;
  mono: string;
  ink: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null, e?: Konva.KonvaEventObject<MouseEvent>) => void;
}) {
  const ref = useRef<Konva.Group>(null);
  const first = useRef(true);
  const x = ox + p.x;
  const y = oy + p.y;
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    if (first.current) {
      first.current = false;
      if (animate) {
        g.opacity(0);
        g.to({ opacity: 1, duration: 0.22 });
      }
      return;
    }
    if (animate) g.to({ x, y, duration: 0.28, easing: (t: number, b: number, c: number, d: number) => c * (1 - Math.pow(1 - t / d, 3)) + b });
    else g.position({ x, y });
  }, [x, y, animate]);
  const pxW = p.w * scale;
  const pxH = p.h * scale;
  const fs = 10.5 / scale;
  const showLabel = pxW > 54 && pxH > 26;
  const showSub = pxW > 70 && pxH > 40;
  const tech = mode === "technical";
  const waste = mode === "waste";
  return (
    <Group
      ref={ref}
      x={x}
      y={y}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect(p.id);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect(p.id);
      }}
      onMouseEnter={(e) => onHover(p.id, e)}
      onMouseMove={(e) => onHover(p.id, e)}
      onMouseLeave={() => onHover(null)}
    >
      {tech && clearance > 0 && <Rect x={-clearance / 2} y={-clearance / 2} width={p.w + clearance} height={p.h + clearance} stroke={ink} opacity={0.35} strokeWidth={1 / scale} dash={[3 / scale, 3 / scale]} listening={false} />}
      <Rect width={p.w} height={p.h} fill={fill} stroke={selected ? "#cbf36a" : highlighted ? "#cbf36a" : stroke} strokeWidth={(selected ? 3 : highlighted ? 2.5 : 1) / scale} opacity={waste ? 0.55 : 1} />
      {showLabel && (
        <Text x={4 / scale} y={4 / scale} width={p.w - 8 / scale} text={label} fontSize={fs} fontFamily={mono} fill={waste ? ink : "#ffffff"} ellipsis wrap="none" listening={false} />
      )}
      {showSub && (tech || mode === "production" || mode === "comparison") && (
        <Text x={4 / scale} y={4 / scale + fs * 1.35} width={p.w - 8 / scale} text={sub} fontSize={fs * 0.9} fontFamily={mono} fill={waste ? ink : "#ffffffcc"} ellipsis wrap="none" listening={false} />
      )}
      {tech && grain !== "none" && pxW > 30 && pxH > 30 && (
        <Arrow
          points={grain === "x" ? [p.w * 0.3, p.h * 0.62, p.w * 0.7, p.h * 0.62] : [p.w * 0.5, p.h * 0.3, p.w * 0.5, p.h * 0.8]}
          stroke="#ffffffd0"
          fill="#ffffffd0"
          strokeWidth={1.2 / scale}
          pointerLength={6 / scale}
          pointerWidth={5 / scale}
          listening={false}
        />
      )}
      {tech && pxW > 50 && pxH > 50 && (
        <Text x={0} y={p.h - fs * 1.4} width={p.w - 4 / scale} align="right" text={`${p.w}×${p.h}${p.rotated ? " ↻" : ""}`} fontSize={fs * 0.9} fontFamily={mono} fill="#ffffffd0" listening={false} />
      )}
    </Group>
  );
});

function ManufacturingCanvasInner(props: CanvasProps) {
  const { width, height, instances, placements, products, layout, mode, colors, transform, onTransform, selectedId, onSelect, onHover, onCursor, highlight, dim, animate = true, caption, clearance, showRulers = true } = props;
  const stageRef = useRef<Konva.Stage>(null);
  const ink = useCssVar("--ink", "#171a17");
  const muted = useCssVar("--muted", "#5f655d");
  const surface = useCssVar("--surface", "#ffffff");
  const canvasBg = useCssVar("--canvas", "#e9e7df");
  const lineStrong = useCssVar("--line-strong", "#c3c5bb");
  const err = useCssVar("--err", "#b94d44");
  const mono = useCssVar("--font-geist-mono", "monospace");
  const t = transform;
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const instById = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  const usedInstances = useMemo(() => new Set(placements.map((p) => p.instanceId)), [placements]);

  const visible = useMemo(() => {
    const a = screenToWorld(t, { x: 0, y: 0 });
    const b = screenToWorld(t, { x: width, y: height });
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }, [t, width, height]);

  const grid = useMemo(() => {
    const step = tickStep(t.scale) / 2;
    const lines: { pts: number[]; major: boolean }[] = [];
    const sx = Math.floor(visible.x0 / step) * step;
    const sy = Math.floor(visible.y0 / step) * step;
    if ((visible.x1 - visible.x0) / step > 400) return lines;
    for (let x = sx; x <= visible.x1; x += step) lines.push({ pts: [x, visible.y0, x, visible.y1], major: Math.round(x / step) % 2 === 0 });
    for (let y = sy; y <= visible.y1; y += step) lines.push({ pts: [visible.x0, y, visible.x1, y], major: Math.round(y / step) % 2 === 0 });
    return lines;
  }, [visible, t.scale]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    if (e.evt.ctrlKey || e.evt.metaKey || Math.abs(e.evt.deltaY) > 0) {
      const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015));
      onTransform(zoomAround(t, pointer, factor, 0.005, 20));
    }
  };

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    drag.current = { x: pos.x, y: pos.y, tx: t.tx, ty: t.ty, moved: false };
    void e;
  };
  const onMove = () => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    onCursor?.(screenToWorld(t, pos));
    const d = drag.current;
    if (!d) return;
    const dx = pos.x - d.x;
    const dy = pos.y - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    onTransform({ scale: t.scale, tx: d.tx + dx, ty: d.ty + dy });
  };
  const onUp = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && e.target === stageRef.current) onSelect(null, null);
  };

  const hover = (kind: "piece" | "instance") => (id: string | null, e?: Konva.KonvaEventObject<MouseEvent>) => {
    if (!onHover) return;
    if (!id || !e) return onHover(null);
    const pos = stageRef.current?.getPointerPosition();
    if (pos) onHover({ kind, id, screen: pos });
  };
  const pieceHover = useMemo(() => hover("piece"), [onHover]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieceSelect = useMemo(() => (id: string) => onSelect(id, "piece"), [onSelect]);

  const step = tickStep(t.scale);
  const rulerTicks = (axis: "x" | "y") => {
    const out: { v: number; s: number }[] = [];
    const a = axis === "x" ? visible.x0 : visible.y0;
    const b = axis === "x" ? visible.x1 : visible.y1;
    for (let v = Math.floor(a / step) * step; v <= b; v += step) out.push({ v, s: axis === "x" ? v * t.scale + t.tx : v * t.scale + t.ty });
    return out;
  };

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onWheel={onWheel}
      onMouseDown={onDown}
      onTouchStart={onDown}
      onMouseMove={onMove}
      onTouchMove={onMove}
      onMouseUp={onUp}
      onTouchEnd={onUp}
      onMouseLeave={() => {
        drag.current = null;
        onCursor?.(null);
        onHover?.(null);
      }}
      style={{ background: canvasBg, cursor: "grab" }}
    >
      <Layer listening={false}>
        <Group x={t.tx} y={t.ty} scaleX={t.scale} scaleY={t.scale}>
          {grid.map((g, i) => (
            <Line key={i} points={g.pts} stroke={ink} opacity={g.major ? 0.07 : 0.035} strokeWidth={1 / t.scale} />
          ))}
        </Group>
      </Layer>
      <Layer opacity={dim ? 0.45 : 1}>
        <Group x={t.tx} y={t.ty} scaleX={t.scale} scaleY={t.scale}>
          {instances.map((inst) => {
            const o = layout.pos.get(inst.id);
            if (!o) return null;
            const used = usedInstances.has(inst.id);
            const sel = selectedId === inst.id;
            const fs = 11 / t.scale;
            const matFill = mode === "material" ? inst.color : surface;
            return (
              <Group key={inst.id} x={o.x} y={o.y}>
                {inst.width * t.scale > 28 && (
                  <Text
                    y={-fs * 1.6}
                    width={inst.width}
                    wrap="none"
                    ellipsis
                    text={inst.width * t.scale > 190 ? `${inst.id}  ${inst.width}×${inst.height}  ${inst.fabricType.toUpperCase()}` : inst.id}
                    fontSize={fs}
                    fontFamily={mono}
                    fill={used || mode === "material" ? ink : muted}
                    listening={false}
                  />
                )}
                <Rect
                  width={inst.width}
                  height={inst.height}
                  fill={matFill}
                  opacity={mode === "material" ? 0.92 : 1}
                  stroke={sel ? "#cbf36a" : lineStrong}
                  strokeWidth={(sel ? 3 : 1) / t.scale}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onSelect(inst.id, "instance");
                  }}
                  onMouseEnter={(e) => hover("instance")(inst.id, e)}
                  onMouseLeave={() => onHover?.(null)}
                />
                {mode === "material" && inst.color && <Rect width={inst.width} height={inst.height} fill={surface} opacity={0.12} listening={false} />}
                {mode === "waste" && <Hatch x={0} y={0} w={inst.width} h={inst.height} color={err} spacing={14 / t.scale} strokeWidth={1 / t.scale} fill="rgba(185,77,68,0.08)" />}
                {inst.defects.map((d, i) => (
                  <Group key={i} listening={false}>
                    <Hatch x={d.x} y={d.y} w={d.w} h={d.h} color={err} spacing={6 / t.scale} strokeWidth={1.2 / t.scale} fill="rgba(185,77,68,0.18)" />
                    <Rect x={d.x} y={d.y} width={d.w} height={d.h} stroke={err} strokeWidth={1 / t.scale} dash={[4 / t.scale, 2 / t.scale]} />
                  </Group>
                ))}
                {(mode === "material" || mode === "technical") && inst.grain !== "none" && inst.width * t.scale > 60 && (
                  <Arrow
                    points={inst.grain === "x" ? [inst.width - 70, inst.height + 18, inst.width - 10, inst.height + 18] : [inst.width + 18, 10, inst.width + 18, 70]}
                    stroke={muted}
                    fill={muted}
                    strokeWidth={1 / t.scale}
                    pointerLength={5 / t.scale}
                    pointerWidth={4 / t.scale}
                    listening={false}
                  />
                )}
              </Group>
            );
          })}
          {mode !== "material" &&
            placements.map((p) => {
              const o = layout.pos.get(p.instanceId);
              const inst = instById.get(p.instanceId);
              if (!o || !inst) return null;
              const color = mode === "waste" ? "#b8bcb0" : colors.get(p.productId) ?? "#2f6b4c";
              return (
                <Piece
                  key={p.id}
                  p={p}
                  ox={o.x}
                  oy={o.y}
                  fill={color}
                  stroke="rgba(0,0,0,0.35)"
                  label={`${productName.get(p.productId) ?? p.productId}`}
                  sub={`${p.pieceName} · ${p.unitId.split("/").pop()}`}
                  scale={t.scale}
                  mode={mode}
                  selected={selectedId === p.id}
                  highlighted={!!highlight?.has(p.unitId)}
                  grain={inst.grain}
                  clearance={clearance}
                  animate={animate}
                  mono={mono}
                  ink={ink}
                  onSelect={pieceSelect}
                  onHover={pieceHover}
                />
              );
            })}
          {mode === "material" &&
            placements.map((p) => {
              const o = layout.pos.get(p.instanceId);
              if (!o) return null;
              return <Rect key={p.id} x={o.x + p.x} y={o.y + p.y} width={p.w} height={p.h} stroke={ink} opacity={0.35} strokeWidth={1 / t.scale} dash={[4 / t.scale, 3 / t.scale]} listening={false} />;
            })}
        </Group>
      </Layer>
      {showRulers && (
        <Layer listening={false}>
          <Rect x={0} y={0} width={width} height={RULER} fill={surface} opacity={0.94} />
          <Rect x={0} y={0} width={RULER} height={height} fill={surface} opacity={0.94} />
          <Line points={[0, RULER, width, RULER]} stroke={lineStrong} strokeWidth={1} />
          <Line points={[RULER, 0, RULER, height]} stroke={lineStrong} strokeWidth={1} />
          {rulerTicks("x").map(({ v, s }) =>
            s > RULER ? (
              <Group key={`x${v}`}>
                <Line points={[s, RULER - 7, s, RULER]} stroke={muted} strokeWidth={1} />
                <Text x={s + 3} y={4} text={String(v)} fontSize={9.5} fontFamily={mono} fill={muted} />
              </Group>
            ) : null,
          )}
          {rulerTicks("y").map(({ v, s }) =>
            s > RULER ? (
              <Group key={`y${v}`}>
                <Line points={[RULER - 7, s, RULER, s]} stroke={muted} strokeWidth={1} />
                <Text x={4} y={s - 3} text={String(v)} fontSize={9.5} fontFamily={mono} fill={muted} rotation={-90} />
              </Group>
            ) : null,
          )}
          <Rect x={0} y={0} width={RULER} height={RULER} fill={surface} />
          <Text x={3} y={6} text="mm" fontSize={8.5} fontFamily={mono} fill={muted} />
          {caption && (
            <Group x={RULER + 10} y={RULER + 10}>
              <Rect width={caption.length * 6.6 + 16} height={20} fill={ink} cornerRadius={2} />
              <Text x={8} y={5} text={caption} fontSize={10.5} fontFamily={mono} fill={surface} />
            </Group>
          )}
        </Layer>
      )}
    </Stage>
  );
}

export default memo(ManufacturingCanvasInner);
