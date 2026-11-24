"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CONDITIONS, FABRIC_TYPES, type MaterialRemnant, type Rect } from "@/core/domain/types";
import { remnantSchema } from "@/core/domain/schemas";
import { fromMm, toMm, type LengthUnit } from "@/core/domain/units";
import { useWorkspace } from "@/stores/workspace";
import { uid } from "@/lib/id";
import { Button, Checkbox, Dialog, Field, IconButton, Input, Select, Textarea } from "@/components/ui/primitives";
import { RemnantPreview } from "./RemnantPreview";

export function blankRemnant(): MaterialRemnant {
  return {
    id: uid("M-"),
    name: "",
    fabricType: "cotton",
    color: "#b9b19a",
    colorName: "",
    width: 1000,
    height: 600,
    condition: "good",
    quantity: 1,
    reserved: 0,
    consumed: 0,
    batchId: "",
    grain: "y",
    allowRotation: true,
    defects: [],
    location: "",
    notes: "",
    source: "manual",
    createdAt: Date.now(),
  };
}

type Draft = Omit<MaterialRemnant, "width" | "height" | "defects"> & { width: string; height: string; defects: { x: string; y: string; w: string; h: string }[] };

export function RemnantForm({ open, initial, onClose, onSaved }: { open: boolean; initial: MaterialRemnant | null; onClose: () => void; onSaved?: (r: MaterialRemnant) => void }) {
  const upsert = useWorkspace((s) => s.upsertRemnant);
  const prefUnit = useWorkspace((s) => s.prefs.unit);
  const [unit, setUnit] = useState<LengthUnit>(prefUnit);
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isNew = !initial || !useWorkspace.getState().remnants.some((r) => r.id === initial.id);

  useEffect(() => {
    if (!open) return;
    const base = initial ?? blankRemnant();
    const u = prefUnit;
    setUnit(u);
    const fmt = (mm: number) => String(fromMm(mm, u));
    setD({ ...base, width: fmt(base.width), height: fmt(base.height), defects: base.defects.map((x) => ({ x: fmt(x.x), y: fmt(x.y), w: fmt(x.w), h: fmt(x.h) })) });
    setErrors({});
  }, [open, initial, prefUnit]);

  if (!d) return null;
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const mm = (s: string) => toMm(Number(s), unit);
  const changeUnit = (u: LengthUnit) => {
    const conv = (s: string) => String(fromMm(toMm(Number(s), unit), u));
    setD({ ...d, width: conv(d.width), height: conv(d.height), defects: d.defects.map((x) => ({ x: conv(x.x), y: conv(x.y), w: conv(x.w), h: conv(x.h) })) });
    setUnit(u);
  };
  const preview = { width: Math.max(1, mm(d.width) || 1), height: Math.max(1, mm(d.height) || 1), color: d.color, grain: d.grain, contour: d.contour, defects: d.defects.map((x) => ({ x: mm(x.x) || 0, y: mm(x.y) || 0, w: mm(x.w) || 0, h: mm(x.h) || 0 })).filter((x) => x.w > 0 && x.h > 0) };

  const save = () => {
    const candidate: MaterialRemnant = {
      ...d,
      width: mm(d.width),
      height: mm(d.height),
      quantity: Number(d.quantity),
      reserved: Number(d.reserved),
      gsm: d.gsm === undefined || (d.gsm as unknown) === "" || Number.isNaN(Number(d.gsm)) ? undefined : Number(d.gsm),
      replacementCost: d.replacementCost === undefined || (d.replacementCost as unknown) === "" || Number.isNaN(Number(d.replacementCost)) ? undefined : Number(d.replacementCost),
      thicknessMm: d.thicknessMm === undefined || (d.thicknessMm as unknown) === "" || Number.isNaN(Number(d.thicknessMm)) ? undefined : Number(d.thicknessMm),
      defects: d.defects.map((x) => ({ x: mm(x.x), y: mm(x.y), w: mm(x.w), h: mm(x.h) }) as Rect),
    };
    const parsed = remnantSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = errs[String(i.path[0])] ?? i.message;
      setErrors(errs);
      return;
    }
    upsert(parsed.data as MaterialRemnant);
    onSaved?.(parsed.data as MaterialRemnant);
    onClose();
  };

  const num = (v: number | undefined) => (v === undefined ? "" : String(v));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={isNew ? "Add material remnant" : `Edit ${initial?.name ?? "material"}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} data-testid="save-remnant">{isNew ? "Add to inventory" : "Save changes"}</Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-2 gap-3">
          <Field className="col-span-2" label="Name" htmlFor="r-name" error={errors.name}>
            <Input id="r-name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Denim leg panel" aria-invalid={!!errors.name} />
          </Field>
          <Field label="Fabric type" htmlFor="r-fab">
            <Select id="r-fab" value={d.fabricType} onChange={(e) => set({ fabricType: e.target.value as MaterialRemnant["fabricType"] })}>
              {FABRIC_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Colour" htmlFor="r-col" error={errors.color}>
            <div className="flex gap-2">
              <input id="r-col" type="color" value={d.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-10 border border-line-strong rounded-[3px] bg-surface p-0.5" aria-label="Colour swatch" />
              <Input value={d.colorName} onChange={(e) => set({ colorName: e.target.value })} placeholder="Colour name" aria-label="Colour name" />
            </div>
          </Field>
          <div className="col-span-2 grid grid-cols-[1fr_1fr_90px] gap-3">
            <Field label={`Width (${unit})`} htmlFor="r-w" error={errors.width}>
              <Input id="r-w" type="number" step="any" min={0} value={d.width} onChange={(e) => set({ width: e.target.value })} aria-invalid={!!errors.width} />
            </Field>
            <Field label={`Height (${unit})`} htmlFor="r-h" error={errors.height}>
              <Input id="r-h" type="number" step="any" min={0} value={d.height} onChange={(e) => set({ height: e.target.value })} aria-invalid={!!errors.height} />
            </Field>
            <Field label="Unit" htmlFor="r-unit">
              <Select id="r-unit" value={unit} onChange={(e) => changeUnit(e.target.value as LengthUnit)}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </Select>
            </Field>
          </div>
          <p className="col-span-2 -mt-1 text-[11.5px] text-muted num">Stored as {mm(d.width) || "—"} × {mm(d.height) || "—"} mm (integer millimetres). Enter the certified rectangular usable region.</p>
          <Field label="Quantity (identical pieces)" htmlFor="r-q" error={errors.quantity}>
            <Input id="r-q" type="number" min={0} step={1} value={d.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} />
          </Field>
          <Field label="Reserved (excluded from optimization)" htmlFor="r-res" error={errors.reserved}>
            <Input id="r-res" type="number" min={0} step={1} value={d.reserved} onChange={(e) => set({ reserved: Number(e.target.value) })} />
          </Field>
          <Field label="GSM (g/m²) — optional" htmlFor="r-gsm" error={errors.gsm} hint="Used for mass estimates only.">
            <Input id="r-gsm" type="number" min={0} value={num(d.gsm)} onChange={(e) => set({ gsm: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="Thickness (mm) — optional" htmlFor="r-th" error={errors.thicknessMm}>
            <Input id="r-th" type="number" min={0} step="any" value={num(d.thicknessMm)} onChange={(e) => set({ thicknessMm: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="Grain direction" htmlFor="r-grain" hint="Direction of the lengthwise grain.">
            <Select id="r-grain" value={d.grain} onChange={(e) => set({ grain: e.target.value as MaterialRemnant["grain"] })}>
              <option value="y">Vertical (along height)</option>
              <option value="x">Horizontal (along width)</option>
              <option value="none">None / non-woven</option>
            </Select>
          </Field>
          <Field label="Condition" htmlFor="r-cond">
            <Select id="r-cond" value={d.condition} onChange={(e) => set({ condition: e.target.value as MaterialRemnant["condition"] })}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <div className="col-span-2">
            <Checkbox checked={d.allowRotation} onChange={(v) => set({ allowRotation: v })} label="Pieces may be rotated 90° on this material" description="Untick for directional prints, nap or pile fabrics." />
          </div>
          <Field label="Batch ID" htmlFor="r-batch"><Input id="r-batch" value={d.batchId} onChange={(e) => set({ batchId: e.target.value })} /></Field>
          <Field label="Storage location" htmlFor="r-loc"><Input id="r-loc" value={d.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          <Field label="Replacement cost per piece — optional" htmlFor="r-cost" error={errors.replacementCost}>
            <Input id="r-cost" type="number" min={0} step="any" value={num(d.replacementCost)} onChange={(e) => set({ replacementCost: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <div />
          <Field className="col-span-2" label="Notes" htmlFor="r-notes"><Textarea id="r-notes" value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>

          <div className="col-span-2 border-t border-line pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12.5px] font-medium">Defect exclusion zones ({unit}, from top-left)</span>
              <Button size="sm" icon={<Plus size={12} />} onClick={() => set({ defects: [...d.defects, { x: "0", y: "0", w: String(fromMm(50, unit)), h: String(fromMm(50, unit)) }] })}>Add defect</Button>
            </div>
            {errors.defects && <p className="text-[11.5px] text-err mb-1">{errors.defects}</p>}
            {d.defects.length === 0 && <p className="text-[12px] text-muted">No defects. Stains, holes and worn areas are excluded from cutting.</p>}
            {d.defects.map((x, i) => (
              <div key={i} className="grid grid-cols-[repeat(4,1fr)_32px] gap-2 mb-1.5">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <Input key={k} type="number" step="any" min={0} aria-label={`Defect ${i + 1} ${k}`} value={x[k]} onChange={(e) => set({ defects: d.defects.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)) })} placeholder={k} />
                ))}
                <IconButton label={`Remove defect ${i + 1}`} onClick={() => set({ defects: d.defects.filter((_, j) => j !== i) })}><Trash2 size={14} /></IconButton>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label-caps">Geometry preview</span>
          <div className="border border-line bg-canvas tech-grid p-2">
            <RemnantPreview r={preview} className="w-full h-[220px]" />
          </div>
          <p className="text-[11.5px] text-muted num">Area {((preview.width * preview.height) / 1e6).toFixed(3)} m² per piece · {((preview.width * preview.height * (Number(d.quantity) || 0)) / 1e6).toFixed(3)} m² total</p>
          {d.photo && <img src={d.photo} alt="Scanned photograph" className="border border-line max-h-40 object-contain" />}
          {d.source === "scanner" && <p className="text-[11.5px] text-warn">Dimensions estimated from a photograph — verify with a tape measure before cutting.</p>}
        </div>
      </div>
    </Dialog>
  );
}
