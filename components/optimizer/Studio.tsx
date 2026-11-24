"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronFirst, ChevronLast, Columns2, Loader2, Maximize, Minus, Pause, Play, Plus, Save, Square, StepBack, StepForward, Zap } from "lucide-react";
import type { MaterialInstance, OptimizationResult, Placement } from "@/core/domain/types";
import { expandInstances, requestHash } from "@/core/optimization/prepare";
import { fitTransform, zoomAround, type ViewTransform } from "@/core/geometry/rect";
import { useWorkspace } from "@/stores/workspace";
import { useRun } from "@/stores/run";
import { useElementSize, isTypingTarget, usePrefersReducedMotion } from "@/lib/hooks";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/id";
import { Button, Dialog, Field, IconButton, Input, Kbd, Segmented, Tag, Textarea } from "@/components/ui/primitives";
import { layoutInstances, productColorMap, type ViewMode } from "@/components/canvas/layout";
import type { HoverInfo } from "@/components/canvas/ManufacturingCanvas";
import { InputPanel } from "./InputPanel";
import { Inspector, type ProductDiff } from "./Inspector";

const Canvas = dynamic(() => import("@/components/canvas/ManufacturingCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[12.5px] text-muted gap-2">
      <Loader2 size={14} className="animate-spin" /> Loading canvas…
    </div>
  ),
});

const MODES: { value: ViewMode; label: string; key: string }[] = [
  { value: "material", label: "Material", key: "1" },
  { value: "production", label: "Production", key: "2" },
  { value: "waste", label: "Waste", key: "3" },
  { value: "comparison", label: "Compare", key: "4" },
  { value: "technical", label: "Technical", key: "5" },
];

type Track = "search" | "build";

export function Studio() {
  const router = useRouter();
  const params = useSearchParams();
  const ws = useWorkspace();
  const settings = ws.project!.settings;
  const run = useRun();
  const f = useFormat();
  const reduced = usePrefersReducedMotion();

  const request = useMemo(() => ws.buildRequest(), [ws.remnants, ws.products, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const hash = useMemo(() => (request ? requestHash(request) : null), [request]);
  const baselineHash = useMemo(() => (request ? requestHash({ ...request, algorithm: "shelf" }) : null), [request]);
  const result = settings.lastResult;
  const baseline = settings.baselineResult;
  const outdated = !!result && result.inputHash !== hash;
  const baselineOutdated = !!baseline && baseline.inputHash !== baselineHash;
  const running = run.status === "running";

  const [mode, setMode] = useState<ViewMode>("production");
  const [selected, setSelected] = useState<{ id: string; kind: "piece" | "instance" } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  // Instances to display: the result's snapshot, or the current inputs when running / no result.
  const currentInstances = useMemo(() => (request ? expandInstances(request.remnants) : []), [request]);
  const instances: MaterialInstance[] = running || !result ? currentInstances : result.instances;
  const layout = useMemo(() => layoutInstances(instances), [instances]);
  const colors = useMemo(() => productColorMap(ws.products.map((p) => p.id)), [ws.products]);

  // ── Playback over REAL solver states ──
  const improvements = useMemo(() => (result?.history ?? []).filter((h) => h.kind === "improvement" && h.placements), [result]);
  const buildOrder = useMemo(() => (result ? [...result.placements].sort((a, b) => a.seq - b.seq) : []), [result]);
  const [track, setTrack] = useState<Track>("search");
  const trackLen = track === "search" ? improvements.length : buildOrder.length;
  const [frame, setFrame] = useState<number>(-1); // -1 = final best
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    setFrame(-1);
    setPlaying(false);
  }, [result, track]);
  useEffect(() => {
    if (!playing) return;
    const base = track === "search" ? 420 : Math.max(18, 2400 / Math.max(1, buildOrder.length));
    const id = setInterval(() => {
      setFrame((fr) => {
        const cur = fr < 0 ? trackLen - 1 : fr;
        if (cur >= trackLen - 1) {
          setPlaying(false);
          return -1;
        }
        return cur + 1;
      });
    }, base / speed);
    return () => clearInterval(id);
  }, [playing, speed, track, trackLen, buildOrder.length]);
  const startPlay = () => {
    if (trackLen === 0) return;
    if (frame < 0 || frame >= trackLen - 1) setFrame(0);
    setPlaying(true);
  };

  let placements: Placement[] = [];
  let frameLabel = "";
  if (running) placements = run.live ?? [];
  else if (result?.ok) {
    if (frame < 0) placements = result.placements;
    else if (track === "search") {
      const s = improvements[Math.min(frame, improvements.length - 1)];
      placements = s?.placements ?? [];
      frameLabel = s ? `Snapshot ${frame + 1}/${improvements.length} · iteration ${s.iteration} · ${f.pct(s.utilization, 2)} · ${s.products} products · ${s.label}` : "";
    } else {
      placements = buildOrder.slice(0, frame + 1);
      const p = buildOrder[frame];
      frameLabel = p ? `Piece ${frame + 1}/${buildOrder.length} · ${p.unitId} · ${p.pieceName}` : "";
    }
  }

  // ── Change highlighting vs previous run ──
  const diff: ProductDiff[] = useMemo(() => {
    const prev = settings.previousResult;
    if (!result?.ok || !prev?.ok) return [];
    return ws.products.map((p) => ({ productId: p.id, name: p.name, before: prev.productCounts[p.id] ?? 0, after: result.productCounts[p.id] ?? 0 })).filter((d) => d.before !== d.after);
  }, [result, settings.previousResult, ws.products]);
  const highlight = useMemo(() => {
    const s = new Set<string>();
    for (const d of diff) for (let i = d.before + 1; i <= d.after; i++) s.add(`${d.productId}/${i}`);
    return s;
  }, [diff]);

  // ── View transform ──
  const [boxRef, size] = useElementSize<HTMLDivElement>();
  const [t, setT] = useState<ViewTransform>({ scale: 0.2, tx: 40, ty: 40 });
  const compare = mode === "comparison";
  const paneW = compare ? Math.floor(size.width / 2) : size.width;
  const fit = useCallback(() => {
    if (paneW > 0 && size.height > 0) setT(fitTransform(layout.bounds, paneW, size.height - 0, 36));
  }, [layout.bounds, paneW, size.height]);
  const fittedFor = useRef("");
  useEffect(() => {
    const key = `${layout.bounds.w}x${layout.bounds.h}@${paneW}x${size.height}`;
    if (paneW > 0 && fittedFor.current !== key) {
      fittedFor.current = key;
      fit();
    }
  }, [fit, layout.bounds, paneW, size.height]);

  const doRun = useCallback(async () => {
    if (!request) return;
    setSelected(null);
    setFrame(-1);
    await run.run();
  }, [request, run]);

  const doBaseline = useCallback(async () => {
    await run.runBaseline();
    setMode("comparison");
  }, [run]);

  // auto-run from command palette (?run=1)
  const autoRan = useRef(false);
  useEffect(() => {
    if (params.get("run") === "1" && !autoRan.current && request) {
      autoRan.current = true;
      router.replace("/workspace/optimizer");
      void doRun();
    }
  }, [params, request, doRun, router]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r" && !running) void doRun();
      else if (k === "escape" && running) run.cancel();
      else if (k === "f") fit();
      else if (k === "b" && !running) void doBaseline();
      else if (MODES.some((m) => m.key === k)) setMode(MODES.find((m) => m.key === k)!.value);
      else if (k === " ") {
        e.preventDefault();
        if (playing) setPlaying(false);
        else startPlay();
      } else if (k === "arrowright") setFrame((fr) => Math.min(trackLen - 1, (fr < 0 ? trackLen - 1 : fr) + 1));
      else if (k === "arrowleft") setFrame((fr) => Math.max(0, (fr < 0 ? trackLen - 1 : fr) - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectedPiece = selected?.kind === "piece" ? (result?.placements.find((p) => p.id === selected.id) ?? placements.find((p) => p.id === selected.id) ?? null) : null;
  const selectedInstance = selected?.kind === "instance" ? (instances.find((i) => i.id === selected.id) ?? null) : null;
  const hoverPiece = hover?.kind === "piece" ? placements.find((p) => p.id === hover.id) : null;
  const hoverInst = hover?.kind === "instance" ? instances.find((i) => i.id === hover.id) : null;
  const pname = new Map(ws.products.map((p) => [p.id, p.name]));

  const cursorLocal = useMemo(() => {
    if (!cursor) return null;
    for (const inst of instances) {
      const o = layout.pos.get(inst.id);
      if (o && cursor.x >= o.x && cursor.y >= o.y && cursor.x <= o.x + inst.width && cursor.y <= o.y + inst.height) return { id: inst.id, x: Math.round(cursor.x - o.x), y: Math.round(cursor.y - o.y) };
    }
    return null;
  }, [cursor, instances, layout]);

  const canvasCommon = {
    width: paneW,
    height: size.height,
    instances,
    products: ws.products,
    layout,
    colors,
    clearance: settings.constraints.clearance,
    transform: t,
    onTransform: setT,
    selectedId: selected?.id ?? null,
    onSelect: (id: string | null, kind: "piece" | "instance" | null) => setSelected(id && kind ? { id, kind } : null),
    onHover: setHover,
    onCursor: setCursor,
    animate: !reduced,
  };

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
        {running ? (
          <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={() => run.cancel()}>
            Stop <Kbd>esc</Kbd>
          </Button>
        ) : (
          <Button variant="primary" size="sm" icon={<Zap size={13} />} onClick={doRun} disabled={!request} data-testid="run-optimization">
            {outdated ? "Re-run" : "Run"} <Kbd>R</Kbd>
          </Button>
        )}
        <Button size="sm" icon={<Columns2 size={13} />} onClick={doBaseline} disabled={running || !request} title="Run the First-Fit Shelf baseline on identical inputs (B)">
          Compare baseline
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Segmented size="sm" label="View mode" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label, title: `${m.label} view (${m.key})` }))} />
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton label="Zoom out" onClick={() => setT((x) => zoomAround(x, { x: paneW / 2, y: size.height / 2 }, 1 / 1.25, 0.005, 20))}><Minus size={14} /></IconButton>
        <span className="num text-[11.5px] w-12 text-center text-muted">{(t.scale * 100).toFixed(t.scale < 0.1 ? 1 : 0)}%</span>
        <IconButton label="Zoom in" onClick={() => setT((x) => zoomAround(x, { x: paneW / 2, y: size.height / 2 }, 1.25, 0.005, 20))}><Plus size={14} /></IconButton>
        <IconButton label="Fit to view (F)" onClick={fit}><Maximize size={14} /></IconButton>
        <div className="flex-1" />
        <Button size="sm" icon={<Save size={13} />} disabled={!result?.ok || outdated || running} onClick={() => setSaveOpen(true)} title={outdated ? "Re-run before saving: the result is outdated" : "Save as production plan"}>
          Save plan
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <div className="hidden lg:block min-h-0"><InputPanel disabled={running} /></div>

        <div className="relative flex min-h-0 min-w-0 flex-col">
          <div ref={boxRef} className="relative min-h-[360px] flex-1 overflow-hidden" data-testid="canvas-area">
            {size.width > 0 && (
              compare ? (
                <div className="flex h-full">
                  <div className="relative border-r border-line-strong" style={{ width: paneW }}>
                    {baseline?.ok ? (
                      <Canvas {...canvasCommon} instances={baseline.instances} placements={baseline.placements} mode="production" caption={`BASELINE · SHELF · ${f.pct(baseline.metrics.utilization)} · ${baseline.metrics.productsCompleted} products`} dim={baselineOutdated} />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-muted">
                        No baseline for these inputs yet.
                        <Button size="sm" onClick={doBaseline} disabled={running}>Run baseline</Button>
                      </div>
                    )}
                  </div>
                  <div className="relative" style={{ width: paneW }}>
                    <Canvas {...canvasCommon} placements={placements} mode="production" caption={result?.ok ? `${result.algorithm.toUpperCase()} · ${f.pct(result.metrics.utilization)} · ${result.metrics.productsCompleted} products` : "NO RESULT"} highlight={highlight} dim={outdated} />
                  </div>
                </div>
              ) : (
                <Canvas {...canvasCommon} placements={placements} mode={mode} highlight={frame < 0 ? highlight : undefined} dim={outdated && !running} />
              )
            )}

            {/* Overlays */}
            {!request?.remnants.length && !running && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto border border-line-strong bg-surface p-5 rounded-[3px] max-w-sm text-center">
                  <p className="text-[13.5px] font-semibold">No material selected</p>
                  <p className="text-[12.5px] text-muted mt-1">Add remnants to the inventory, or include them in the Materials tab.</p>
                  <Button size="sm" className="mt-3" onClick={() => router.push("/workspace/inventory?new=1")}>Add material</Button>
                </div>
              </div>
            )}
            {outdated && !running && (
              <div className="absolute left-1/2 top-8 -translate-x-1/2 flex items-center gap-3 border border-warn/40 bg-warn-soft px-3 py-2 rounded-[3px] shadow-sm" role="status" data-testid="outdated-banner">
                <AlertTriangle size={15} className="text-warn" />
                <span className="text-[12.5px]"><strong className="font-semibold">Outdated.</strong> Inputs changed since this layout was computed; it is not valid for the current inventory.</span>
                <Button size="sm" variant="primary" onClick={doRun}>Re-run</Button>
              </div>
            )}
            {running && (
              <div className="absolute left-1/2 top-8 -translate-x-1/2 flex items-center gap-2 border border-line-strong bg-surface px-3 py-2 rounded-[3px] text-[12.5px] shadow-sm" aria-live="polite">
                <Loader2 size={14} className="animate-spin text-primary" />
                {run.kind === "baseline" ? "Running baseline" : "Searching"} · iteration <span className="num">{run.progress?.iteration ?? 0}</span> · best <span className="num">{f.pct(run.progress?.bestUtilization ?? 0, 2)}</span>
              </div>
            )}
            {!running && diff.length > 0 && frame < 0 && !outdated && (
              <div className="absolute right-3 top-8 max-w-[260px] border border-line-strong bg-surface rounded-[3px] p-2.5 text-[12px] shadow-sm" data-testid="replan-diff">
                <div className="label-caps mb-1">Replanned · vs previous run</div>
                {diff.map((d) => (
                  <div key={d.productId} className="flex justify-between gap-3 num">
                    <span className="truncate font-sans">{d.name}</span>
                    <span className={d.after > d.before ? "text-primary" : "text-err"}>{d.after > d.before ? "+" : ""}{d.after - d.before}</span>
                  </div>
                ))}
                <div className="mt-1 text-[10.5px] text-muted">New units outlined in lime.</div>
              </div>
            )}
            {hover && (hoverPiece || hoverInst) && (
              <div className="pointer-events-none absolute z-10 border border-ink bg-ink text-bg rounded-[2px] px-2 py-1.5 text-[11px] font-mono" style={{ left: Math.min(hover.screen.x + 14 + (compare && hover.screen.x < paneW ? 0 : 0), size.width - 220), top: hover.screen.y + 14 }}>
                {hoverPiece ? (
                  <>
                    <div className="font-sans font-semibold">{pname.get(hoverPiece.productId)} · {hoverPiece.pieceName}</div>
                    <div>{hoverPiece.unitId} on {hoverPiece.instanceId}</div>
                    <div>{hoverPiece.w}×{hoverPiece.h} mm @ ({hoverPiece.x}, {hoverPiece.y}){hoverPiece.rotated ? " · R90" : ""}</div>
                  </>
                ) : hoverInst ? (
                  <>
                    <div className="font-sans font-semibold">{hoverInst.name}</div>
                    <div>{hoverInst.id} · {hoverInst.width}×{hoverInst.height} mm · {hoverInst.fabricType}</div>
                  </>
                ) : null}
              </div>
            )}
            {/* Legend */}
            {mode !== "material" && !compare && (
              <div className="absolute bottom-2 left-8 flex flex-wrap gap-x-3 gap-y-1 max-w-[70%] bg-surface/90 border border-line px-2 py-1 rounded-[2px] text-[10.5px]">
                {mode === "waste" ? (
                  <><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 hatch border border-err/50" /> unallocated / waste</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-[#b8bcb0]" /> allocated</span></>
                ) : (
                  ws.products.filter((p) => placements.some((x) => x.productId === p.id)).map((p) => (
                    <span key={p.id} className="flex items-center gap-1"><span className="h-2.5 w-2.5" style={{ background: colors.get(p.id) }} />{p.name}</span>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="border-t border-line bg-surface px-3 py-2" aria-label="Optimization playback">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" label="Playback track" value={track} onChange={setTrack} options={[{ value: "search", label: "Search snapshots", title: "Best-so-far layouts recorded by the solver" }, { value: "build", label: "Build order", title: "Pieces in the order the solver placed them" }]} />
              <IconButton label="First frame" onClick={() => setFrame(0)} disabled={!trackLen}><ChevronFirst size={14} /></IconButton>
              <IconButton label="Step back" onClick={() => setFrame((fr) => Math.max(0, (fr < 0 ? trackLen - 1 : fr) - 1))} disabled={!trackLen}><StepBack size={14} /></IconButton>
              <IconButton label={playing ? "Pause" : "Play"} onClick={() => (playing ? setPlaying(false) : startPlay())} disabled={!trackLen} className="bg-ink text-bg hover:bg-ink hover:text-accent">{playing ? <Pause size={14} /> : <Play size={14} />}</IconButton>
              <IconButton label="Step forward" onClick={() => setFrame((fr) => Math.min(trackLen - 1, (fr < 0 ? trackLen - 1 : fr) + 1))} disabled={!trackLen}><StepForward size={14} /></IconButton>
              <IconButton label="Jump to best solution" onClick={() => { setPlaying(false); setFrame(-1); }} disabled={!trackLen}><ChevronLast size={14} /></IconButton>
              <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-7 border border-line-strong rounded-[3px] bg-surface px-1 text-[11.5px] num">
                {[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
              <input aria-label="Scrub timeline" type="range" min={0} max={Math.max(0, trackLen - 1)} value={frame < 0 ? Math.max(0, trackLen - 1) : frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} disabled={!trackLen} className="flex-1 min-w-[120px] accent-[var(--primary)]" />
              <span className="num text-[11px] text-muted w-20 text-right">{trackLen ? `${frame < 0 ? trackLen : frame + 1}/${trackLen}` : "—"}</span>
            </div>
            <div className="mt-1 h-4 text-[10.5px] text-muted truncate">
              {frame >= 0 ? <>{frameLabel} {track === "search" && !reduced && <span className="ml-1 italic">· motion between snapshots is interpolated for visualization</span>}</> : result?.ok ? "Showing final best solution." : "Run the optimizer to record real iteration snapshots."}
            </div>
          </div>
        </div>

        <div className="hidden lg:block min-h-0">
          <Inspector result={result} outdated={outdated} running={running} progress={run.progress} diff={diff} prevUtil={settings.previousResult?.ok ? settings.previousResult.metrics.utilization : null} baseline={baselineOutdated ? null : baseline} selectedPiece={selectedPiece} selectedInstance={selectedInstance} products={ws.products} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-7 items-center gap-4 border-t border-line bg-[#181d19] px-3 font-mono text-[10.5px] text-[#e8eae3]/75 overflow-hidden whitespace-nowrap">
        <span className={cn("flex items-center gap-1.5", running ? "text-accent" : outdated ? "text-warn" : "")}>
          <span className={cn("h-1.5 w-1.5", running ? "bg-accent animate-pulse" : outdated ? "bg-warn" : result?.ok ? "bg-accent" : "bg-[#e8eae3]/40")} />
          {running ? "SOLVING" : outdated ? "OUTDATED" : result?.ok ? "VALID" : result ? "FAILED" : "IDLE"}
        </span>
        <span>{cursor ? `X ${Math.round(cursor.x)}  Y ${Math.round(cursor.y)}` : "X —  Y —"}</span>
        <span>{cursorLocal ? `${cursorLocal.id} ▸ ${cursorLocal.x}, ${cursorLocal.y} mm` : ""}</span>
        <span className="hidden md:inline">{instances.length} pieces · {placements.length} cuts</span>
        <span className="flex-1" />
        <span className="hidden md:inline">{settings.algorithm} · seed {settings.search.seed}</span>
        <span>hash {hash ?? "—"}</span>
        <span className="hidden sm:inline">zoom {(t.scale * 100).toFixed(1)}%</span>
      </div>

      <SavePlanDialog open={saveOpen} onClose={() => setSaveOpen(false)} result={result} />
      <MobileHint />
    </div>
  );
}

function SavePlanDialog({ open, onClose, result }: { open: boolean; onClose: () => void; result: OptimizationResult | null }) {
  const savePlan = useWorkspace((s) => s.savePlan);
  const count = useWorkspace((s) => s.plans.length);
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) setName(`Plan ${count + 1} — ${new Date().toLocaleDateString()}`);
  }, [open, count]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save production plan"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            data-testid="confirm-save-plan"
            onClick={() => {
              const p = savePlan(name, notes);
              onClose();
              if (p) toast.success(`Saved "${p.name}" as a draft plan.`, { action: { label: "Open plans", onClick: () => router.push(`/workspace/plans?id=${p.id}`) } });
              else toast.error("Nothing to save: run a valid optimization first.");
            }}
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Plan name" htmlFor="plan-name">
          <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="plan-notes">
          <Textarea id="plan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Operator, deadline, special handling…" />
        </Field>
        {result?.ok && (
          <p className="text-[12px] text-muted">
            {result.metrics.productsCompleted} complete products on {result.metrics.instancesUsed} material pieces. Saving does <strong>not</strong> change inventory — commit the plan from the Plans page when cutting begins.
          </p>
        )}
        <Tag tone="warn" className="self-start">Layouts require practical production verification</Tag>
      </div>
    </Dialog>
  );
}

function MobileHint() {
  return <div className="lg:hidden border-t border-line bg-warn-soft px-3 py-2 text-[12px] text-warn">The manufacturing studio is optimized for desktop. Inputs and the inspector appear on screens ≥ 1024 px wide; use Products and Inventory pages to edit on smaller screens.</div>;
}
