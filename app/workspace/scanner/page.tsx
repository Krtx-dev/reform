"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crosshair, ImageUp, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { FABRIC_TYPES, type FabricType, type MaterialRemnant, type Point } from "@/core/domain/types";
import { applyH, convexHull, homography, maskBoundary, measure, segmentCenter, simplifyPolygon, toGray } from "@/core/vision/vision";
import { rectInsidePolygon } from "@/core/geometry/rect";
import { useWorkspace } from "@/stores/workspace";
import { uid, cn } from "@/lib/id";
import { Button, Checkbox, Field, Input, PageHeader, Panel, Segmented, Select, Tag } from "@/components/ui/primitives";

type Step = "calibrate" | "boundary" | "measure";
type CalMode = "two" | "four";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export default function ScannerPage() {
  const router = useRouter();
  const upsert = useWorkspace((s) => s.upsertRemnant);
  const [img, setImg] = useState<{ url: string; w: number; h: number; el: HTMLImageElement } | null>(null);
  const [step, setStep] = useState<Step>("calibrate");
  const [cal, setCal] = useState<CalMode>("four");
  const [two, setTwo] = useState<Point[]>([]);
  const [knownLen, setKnownLen] = useState(300);
  const [four, setFour] = useState<Point[]>([]);
  const [ref, setRef] = useState({ w: 210, h: 297 });
  const [poly, setPoly] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ list: "two" | "four" | "poly"; i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "Scanned remnant", fabricType: "cotton" as FabricType, color: "#b9b19a", gsm: "", width: "", height: "", confirm: false });

  const load = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg({ url, w: el.naturalWidth, h: el.naturalHeight, el });
      setTwo([]); setFour([]); setPoly([]); setStep("calibrate");
    };
    el.onerror = () => toast.error("Could not read that image.");
    el.src = url;
  };

  const toMm = useMemo(() => {
    if (cal === "two" && two.length === 2 && knownLen > 0) {
      const s = knownLen / dist(two[0], two[1]);
      return (p: Point) => ({ x: p.x * s, y: p.y * s });
    }
    if (cal === "four" && four.length === 4 && ref.w > 0 && ref.h > 0) {
      const H = homography(four, [{ x: 0, y: 0 }, { x: ref.w, y: 0 }, { x: ref.w, y: ref.h }, { x: 0, y: ref.h }]);
      if (H) return (p: Point) => applyH(H, p);
    }
    return null;
  }, [cal, two, four, knownLen, ref]);

  const m = useMemo(() => (toMm && poly.length >= 3 ? measure(poly.map(toMm)) : null), [toMm, poly]);

  const confidence = useMemo(() => {
    if (!img) return null;
    const notes: string[] = [];
    let level: "low" | "medium" = "medium";
    const minSide = Math.min(img.w, img.h);
    if (cal === "two") {
      notes.push("Scale only — no perspective correction. Photograph straight from above.");
      if (two.length === 2 && dist(two[0], two[1]) < minSide * 0.2) { level = "low"; notes.push("Reference spans < 20 % of the image; small clicking errors are amplified."); }
    } else {
      notes.push("Perspective corrected from a 4-corner reference rectangle (planar fabric assumed).");
      if (four.length === 4) {
        const span = Math.max(dist(four[0], four[1]), dist(four[1], four[2]));
        if (span < minSide * 0.15) { level = "low"; notes.push("Reference is small in the frame."); }
      }
    }
    notes.push("Fabric drape, folds and lens distortion are not modelled.");
    return { level, notes };
  }, [img, cal, two, four]);

  const autoDetect = useCallback(async () => {
    if (!img) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 10));
    try {
      const scale = Math.min(1, 600 / Math.max(img.w, img.h));
      const w = Math.round(img.w * scale), h = Math.round(img.h * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img.el, 0, 0, w, h);
      const gray = toGray(ctx.getImageData(0, 0, w, h).data);
      const mask = segmentCenter(gray, w, h);
      if (!mask) {
        toast.warning("Automatic detection failed — the fabric is not clearly separated from the background. Click to trace the outline manually.");
        return;
      }
      const hull = simplifyPolygon(convexHull(maskBoundary(mask, w, h)), 10).map((p) => ({ x: p.x / scale, y: p.y / scale }));
      setPoly(hull);
      toast.success(`Detected an outline with ${hull.length} points. Drag points to correct it.`);
    } finally {
      setBusy(false);
    }
  }, [img]);

  const svgPoint = (e: React.PointerEvent | React.MouseEvent): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: Math.round(r.x), y: Math.round(r.y) };
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (drag) return;
    const p = svgPoint(e);
    if (!p) return;
    if (step === "calibrate") {
      if (cal === "two" && two.length < 2) setTwo([...two, p]);
      if (cal === "four" && four.length < 4) setFour([...four, p]);
    } else if (step === "boundary") setPoly([...poly, p]);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = svgPoint(e);
    if (!p) return;
    const upd = (arr: Point[]) => arr.map((q, i) => (i === drag.i ? p : q));
    if (drag.list === "two") setTwo(upd);
    if (drag.list === "four") setFour(upd);
    if (drag.list === "poly") setPoly(upd);
  };

  const r = Math.max(4, (img ? Math.max(img.w, img.h) : 1000) / 160);
  const handle = (list: "two" | "four" | "poly", p: Point, i: number, color: string, label?: string) => (
    <g key={`${list}${i}`}>
      <circle cx={p.x} cy={p.y} r={r * 1.6} fill="transparent" style={{ cursor: "grab" }} onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setDrag({ list, i }); }} onPointerUp={() => setTimeout(() => setDrag(null), 0)} />
      <circle cx={p.x} cy={p.y} r={r} fill={color} stroke="#fff" strokeWidth={r / 3} pointerEvents="none" />
      {label && <text x={p.x + r * 1.5} y={p.y - r * 1.2} fontSize={r * 2.4} fill="#fff" stroke="#000" strokeWidth={r / 5} paintOrder="stroke" pointerEvents="none">{label}</text>}
    </g>
  );

  const inscribed = m?.inscribed ?? null;
  const W = form.width ? Math.floor(Number(form.width)) : inscribed ? Math.floor(inscribed.w) : 0;
  const H = form.height ? Math.floor(Number(form.height)) : inscribed ? Math.floor(inscribed.h) : 0;
  const exceeds = !!inscribed && (W > Math.floor(inscribed.w) || H > Math.floor(inscribed.h));
  const certified = !!m && !!inscribed && W > 0 && H > 0 && rectInsidePolygon({ x: inscribed.x, y: inscribed.y, w: W, h: H }, m.polygonMm);

  const save = () => {
    if (!m || !inscribed || !img || W <= 0 || H <= 0) return;
    if (!form.confirm) return toast.error("Confirm that the usable rectangle lies entirely inside the fabric.");
    const thumb = document.createElement("canvas");
    const s = Math.min(1, 480 / Math.max(img.w, img.h));
    thumb.width = Math.round(img.w * s); thumb.height = Math.round(img.h * s);
    thumb.getContext("2d")!.drawImage(img.el, 0, 0, thumb.width, thumb.height);
    const gsm = Number(form.gsm);
    const rem: MaterialRemnant = {
      id: uid("SC-"),
      name: form.name || "Scanned remnant",
      fabricType: form.fabricType,
      color: form.color,
      colorName: "",
      width: W,
      height: H,
      gsm: gsm > 0 ? gsm : undefined,
      condition: "good",
      quantity: 1,
      reserved: 0,
      consumed: 0,
      batchId: "SCAN",
      grain: "none",
      allowRotation: true,
      defects: [],
      location: "",
      notes: `Scanner estimate (${cal === "four" ? "4-point perspective" : "2-point scale"} calibration). Traced area ${(m.areaMm2 / 1e6).toFixed(3)} m²; certified rectangle ${W}×${H} mm. Verify with a tape measure before cutting.`,
      photo: thumb.toDataURL("image/jpeg", 0.72),
      contour: m.polygonMm.map((p) => ({ x: Math.round(p.x - inscribed.x), y: Math.round(p.y - inscribed.y) })),
      source: "scanner",
      createdAt: Date.now(),
    };
    upsert(rem);
    toast.success(`Added ${rem.name} (${W}×${H} mm, estimate) to inventory.`);
    router.push("/workspace/inventory");
  };

  // Map an mm-space rectangle back to image space (for overlay), via inverse sampling of corners.
  const inscribedOverlay = useMemo(() => {
    if (!inscribed || !img || !toMm) return null;
    const inv = cal === "four" && four.length === 4 ? homography([{ x: 0, y: 0 }, { x: ref.w, y: 0 }, { x: ref.w, y: ref.h }, { x: 0, y: ref.h }], four) : null;
    const back = (p: Point) => (inv ? applyH(inv, p) : (() => { const s = dist(two[0], two[1]) / knownLen; return { x: p.x * s, y: p.y * s }; })());
    const R = { x: inscribed.x, y: inscribed.y, w: W || inscribed.w, h: H || inscribed.h };
    return [back({ x: R.x, y: R.y }), back({ x: R.x + R.w, y: R.y }), back({ x: R.x + R.w, y: R.y + R.h }), back({ x: R.x, y: R.y + R.h })];
  }, [inscribed, img, toMm, cal, four, ref, two, knownLen, W, H]);

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <PageHeader
        eyebrow="Optional · computer-vision assisted"
        title="Material scanner"
        description="Photograph a remnant flat on a contrasting background next to a reference of known size (an A4 sheet works). Calibrate, trace or auto-detect the boundary, then certify a rectangular usable region. All measurements are estimates; no AI service is used and nothing leaves your browser."
        actions={img && <Button icon={<RotateCcw size={14} />} onClick={() => { setImg(null); setTwo([]); setFour([]); setPoly([]); }}>New photo</Button>}
      />
      {!img ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); }}
          className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-line-strong rounded-[3px] py-24 tech-grid text-center"
        >
          <ImageUp size={28} className="text-muted" />
          <p className="text-[14px] font-medium">Drop a photograph here</p>
          <p className="text-[12.5px] text-muted max-w-md">Best results: shoot straight down, even light, fabric on a plain background of contrasting brightness, reference sheet fully visible.</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Photograph" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
          <Button variant="primary" onClick={() => fileRef.current?.click()}>Choose image</Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="border border-line bg-canvas rounded-[3px] p-2">
            <svg ref={svgRef} viewBox={`0 0 ${img.w} ${img.h}`} className="w-full max-h-[72vh] select-none" style={{ cursor: "crosshair", touchAction: "none" }} onClick={onCanvasClick} onPointerMove={onMove} role="img" aria-label="Photograph with calibration and boundary annotations">
              <image href={img.url} width={img.w} height={img.h} />
              {cal === "two" && two.length === 2 && <line x1={two[0].x} y1={two[0].y} x2={two[1].x} y2={two[1].y} stroke="#cbf36a" strokeWidth={r / 2} />}
              {cal === "four" && four.length >= 2 && <polygon points={four.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(203,243,106,0.15)" stroke="#cbf36a" strokeWidth={r / 2} />}
              {poly.length >= 2 && <polygon points={poly.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(33,77,56,0.18)" stroke="#214d38" strokeWidth={r / 2} strokeDasharray={`${r * 2} ${r}`} />}
              {inscribedOverlay && step === "measure" && <polygon points={inscribedOverlay.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(203,243,106,0.35)" stroke={certified ? "#cbf36a" : "#b94d44"} strokeWidth={r / 1.6} />}
              {cal === "two" && two.map((p, i) => handle("two", p, i, "#cbf36a", `R${i + 1}`))}
              {cal === "four" && four.map((p, i) => handle("four", p, i, "#cbf36a", ["TL", "TR", "BR", "BL"][i]))}
              {step !== "calibrate" && poly.map((p, i) => handle("poly", p, i, "#214d38"))}
            </svg>
          </div>

          <div className="flex flex-col gap-4">
            <Segmented label="Scanner step" value={step} onChange={setStep} options={[{ value: "calibrate", label: "1 Calibrate" }, { value: "boundary", label: "2 Boundary" }, { value: "measure", label: "3 Measure" }]} />

            {step === "calibrate" && (
              <Panel title="Establish scale">
                <Segmented size="sm" label="Calibration method" value={cal} onChange={setCal} options={[{ value: "four", label: "4-corner reference" }, { value: "two", label: "2-point length" }]} />
                {cal === "four" ? (
                  <div className="mt-3 flex flex-col gap-3 text-[12.5px]">
                    <p className="text-muted">Click the reference rectangle's corners in order: top-left, top-right, bottom-right, bottom-left. Corrects perspective.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Reference width (mm)" htmlFor="rw"><Input id="rw" type="number" value={ref.w} onChange={(e) => setRef({ ...ref, w: Number(e.target.value) })} /></Field>
                      <Field label="Reference height (mm)" htmlFor="rh"><Input id="rh" type="number" value={ref.h} onChange={(e) => setRef({ ...ref, h: Number(e.target.value) })} /></Field>
                    </div>
                    <p className="num">{four.length}/4 corners placed</p>
                    <Button size="sm" onClick={() => setFour([])}>Clear corners</Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-3 text-[12.5px]">
                    <p className="text-muted">Click both ends of an object of known length (ruler, tape). Scale only; no perspective correction.</p>
                    <Field label="Known length (mm)" htmlFor="kl"><Input id="kl" type="number" value={knownLen} onChange={(e) => setKnownLen(Number(e.target.value))} /></Field>
                    <p className="num">{two.length}/2 points{two.length === 2 && ` · ${dist(two[0], two[1]).toFixed(0)} px → ${(knownLen / dist(two[0], two[1])).toFixed(3)} mm/px`}</p>
                    <Button size="sm" onClick={() => setTwo([])}>Clear points</Button>
                  </div>
                )}
                <Button className="mt-4 w-full" variant="primary" disabled={!toMm} onClick={() => setStep("boundary")}>Continue to boundary</Button>
              </Panel>
            )}

            {step === "boundary" && (
              <Panel title="Material boundary">
                <div className="flex flex-col gap-2 text-[12.5px]">
                  <Button icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} onClick={autoDetect} disabled={busy}>Auto-detect outline (centre object)</Button>
                  <p className="text-muted">Or click on the photo to add boundary points in order. Drag any point to correct it.</p>
                  <p className="num">{poly.length} points</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setPoly(poly.slice(0, -1))} disabled={!poly.length}>Undo point</Button>
                    <Button size="sm" onClick={() => setPoly([])} disabled={!poly.length}>Clear</Button>
                  </div>
                  {!toMm && <p className="text-warn">Calibrate first to obtain measurements.</p>}
                  <Button className="mt-2" variant="primary" disabled={poly.length < 3 || !toMm} onClick={() => setStep("measure")}>Measure</Button>
                </div>
              </Panel>
            )}

            {step === "measure" && m && (
              <Panel title="Measurements (estimate)" actions={confidence && <Tag tone={confidence.level === "low" ? "err" : "warn"}>{confidence.level} confidence</Tag>}>
                <dl className="grid grid-cols-2 gap-1.5 text-[12.5px]">
                  <dt className="text-muted">Traced area</dt><dd className="num text-right">{(m.areaMm2 / 1e6).toFixed(3)} m²</dd>
                  <dt className="text-muted">Bounding box</dt><dd className="num text-right">{m.bbox.w.toFixed(0)} × {m.bbox.h.toFixed(0)} mm</dd>
                  <dt className="text-muted">Largest inscribed rect.</dt><dd className="num text-right">{inscribed ? `${inscribed.w.toFixed(0)} × ${inscribed.h.toFixed(0)} mm` : "none"}</dd>
                  <dt className="text-muted">Rectangle / traced</dt><dd className="num text-right">{inscribed ? `${((inscribed.w * inscribed.h / m.areaMm2) * 100).toFixed(0)} %` : "—"}</dd>
                </dl>
                <ul className="mt-2 list-disc pl-4 text-[11px] text-muted">{confidence?.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                <p className="mt-2 text-[11px] text-muted">Only the certified rectangle enters the optimizer. The bounding box is never used as available material.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                  <Field className="col-span-2" label="Name" htmlFor="sn"><Input id="sn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  <Field label="Fabric" htmlFor="sf"><Select id="sf" value={form.fabricType} onChange={(e) => setForm({ ...form, fabricType: e.target.value as FabricType })}>{FABRIC_TYPES.map((f) => <option key={f}>{f}</option>)}</Select></Field>
                  <Field label="Colour" htmlFor="sc"><input id="sc" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-full border border-line-strong rounded-[3px] bg-surface p-0.5" /></Field>
                  <Field label="Usable width (mm)" htmlFor="sw"><Input id="sw" type="number" placeholder={inscribed ? String(Math.floor(inscribed.w)) : ""} value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></Field>
                  <Field label="Usable height (mm)" htmlFor="sh"><Input id="sh" type="number" placeholder={inscribed ? String(Math.floor(inscribed.h)) : ""} value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></Field>
                  <Field className="col-span-2" label="GSM — optional" htmlFor="sg"><Input id="sg" type="number" value={form.gsm} onChange={(e) => setForm({ ...form, gsm: e.target.value })} /></Field>
                </div>
                <p className={cn("mt-2 text-[11.5px]", certified ? "text-primary" : "text-err")}>
                  <Crosshair size={12} className="inline mr-1" />
                  {certified ? `${W} × ${H} mm rectangle lies inside the traced outline.` : exceeds ? "The entered rectangle extends beyond the traced outline." : "No valid rectangle inside the outline."}
                </p>
                <div className="mt-2"><Checkbox checked={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} label="I confirm this rectangle lies entirely inside the physical fabric" /></div>
                <Button className="mt-3 w-full" variant="primary" disabled={!certified || !form.confirm} onClick={save}>Save to inventory</Button>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
