"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FABRIC_TYPES, type PatternPiece, type ProductTemplate } from "@/core/domain/types";
import { productSchema } from "@/core/domain/schemas";
import { useWorkspace } from "@/stores/workspace";
import { uid, cn } from "@/lib/id";
import { Button, Checkbox, Dialog, Field, IconButton, Input, Select, Textarea } from "@/components/ui/primitives";
import { PatternPreview } from "./PatternPreview";

export function blankProduct(): ProductTemplate {
  return {
    id: uid("prod_"),
    name: "",
    description: "",
    category: "Custom",
    pieces: [{ id: uid("pc_"), name: "Main panel", width: 300, height: 300, quantity: 2, grain: "y", allowRotation: true }],
    seamAllowance: 10,
    allowedFabrics: ["cotton", "linen"],
    matchFabric: false,
    preferredColors: [],
    value: 10,
    assemblyNotes: "",
    builtin: false,
    createdAt: Date.now(),
  };
}

export function ProductEditor({ open, initial, onClose, onSaved }: { open: boolean; initial: ProductTemplate | null; onClose: () => void; onSaved?: (p: ProductTemplate) => void }) {
  const upsert = useWorkspace((s) => s.upsertProduct);
  const [d, setD] = useState<ProductTemplate>(blankProduct);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setD(initial ? { ...initial, pieces: initial.pieces.map((p) => ({ ...p })) } : blankProduct());
      setErrors([]);
    }
  }, [open, initial]);
  const set = (patch: Partial<ProductTemplate>) => setD({ ...d, ...patch });
  const setPiece = (i: number, patch: Partial<PatternPiece>) => set({ pieces: d.pieces.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const isNew = !initial;
  const cutArea = d.pieces.reduce((s, p) => s + (p.width + 2 * d.seamAllowance) * (p.height + 2 * d.seamAllowance) * p.quantity, 0);

  const save = () => {
    const parsed = productSchema.safeParse({ ...d, builtin: initial?.builtin ?? false });
    if (!parsed.success) {
      setErrors(parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(" › ")}: ${i.message}`));
      return;
    }
    upsert(parsed.data as ProductTemplate);
    onSaved?.(parsed.data as ProductTemplate);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={isNew ? "Create custom product" : `Edit ${initial?.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} data-testid="save-product">{isNew ? "Create product" : "Save product"}</Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-3">
          {errors.length > 0 && (
            <ul className="border border-err/40 bg-err-soft text-err text-[12px] rounded-[3px] p-2 list-disc pl-6">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field className="col-span-2" label="Product name" htmlFor="p-name"><Input id="p-name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Laptop sleeve" /></Field>
            <Field className="col-span-2" label="Description" htmlFor="p-desc"><Input id="p-desc" value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <Field label="Seam allowance (mm, each side)" htmlFor="p-sa"><Input id="p-sa" type="number" min={0} max={200} value={d.seamAllowance} onChange={(e) => set({ seamAllowance: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></Field>
            <Field label="Estimated value per unit" htmlFor="p-val" hint="Illustrative; drives the value objective."><Input id="p-val" type="number" min={0} step="any" value={d.value} onChange={(e) => set({ value: Number(e.target.value) || 0 })} /></Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12.5px] font-medium">Pattern pieces (finished size, mm)</span>
              <Button size="sm" icon={<Plus size={12} />} onClick={() => set({ pieces: [...d.pieces, { id: uid("pc_"), name: `Piece ${d.pieces.length + 1}`, width: 200, height: 200, quantity: 1, grain: "none", allowRotation: true }] })}>Add piece</Button>
            </div>
            <div className="border border-line rounded-[3px] overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12.5px]">
                <thead className="text-[10.5px] text-muted text-left"><tr className="border-b border-line"><th className="font-normal p-1.5">Name</th><th className="font-normal">W</th><th className="font-normal">H</th><th className="font-normal">Qty</th><th className="font-normal">Grain</th><th className="font-normal">Rotate</th><th /></tr></thead>
                <tbody>
                  {d.pieces.map((p, i) => (
                    <tr key={p.id} className="border-b border-line/60">
                      <td className="p-1"><Input className="h-8" aria-label={`Piece ${i + 1} name`} value={p.name} onChange={(e) => setPiece(i, { name: e.target.value })} /></td>
                      <td className="p-1 w-20"><Input className="h-8" type="number" min={1} aria-label={`Piece ${i + 1} width`} value={p.width} onChange={(e) => setPiece(i, { width: Math.round(Number(e.target.value)) })} /></td>
                      <td className="p-1 w-20"><Input className="h-8" type="number" min={1} aria-label={`Piece ${i + 1} height`} value={p.height} onChange={(e) => setPiece(i, { height: Math.round(Number(e.target.value)) })} /></td>
                      <td className="p-1 w-16"><Input className="h-8" type="number" min={1} aria-label={`Piece ${i + 1} quantity`} value={p.quantity} onChange={(e) => setPiece(i, { quantity: Math.round(Number(e.target.value)) })} /></td>
                      <td className="p-1 w-28">
                        <Select className="h-8" aria-label={`Piece ${i + 1} grain`} value={p.grain} onChange={(e) => setPiece(i, { grain: e.target.value as PatternPiece["grain"] })}>
                          <option value="y">Along H</option><option value="x">Along W</option><option value="none">Any</option>
                        </Select>
                      </td>
                      <td className="p-1 text-center"><input type="checkbox" className="accent-[var(--primary)]" aria-label={`Piece ${i + 1} may rotate`} checked={p.allowRotation} onChange={(e) => setPiece(i, { allowRotation: e.target.checked })} /></td>
                      <td className="p-1"><IconButton label={`Remove piece ${i + 1}`} onClick={() => set({ pieces: d.pieces.filter((_, j) => j !== i) })} disabled={d.pieces.length <= 1}><Trash2 size={14} /></IconButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-muted">The optimizer uses rectangular cut pieces. A non-rectangular piece must be entered as its enclosing rectangle — conservative, never optimistic.</p>
          </div>

          <div>
            <span className="text-[12.5px] font-medium">Compatible fabrics</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FABRIC_TYPES.map((fab) => {
                const on = d.allowedFabrics.includes(fab);
                return (
                  <button key={fab} type="button" aria-pressed={on} onClick={() => set({ allowedFabrics: on ? d.allowedFabrics.filter((x) => x !== fab) : [...d.allowedFabrics, fab] })} className={cn("h-7 px-2.5 border rounded-[3px] text-[12px]", on ? "bg-ink text-bg border-ink" : "border-line-strong text-muted hover:text-ink")}>
                    {fab}
                  </button>
                );
              })}
            </div>
          </div>
          <Checkbox checked={d.matchFabric} onChange={(v) => set({ matchFabric: v })} label="All pieces must match in fabric type and colour" description="E.g. cushion covers. Otherwise pieces may be patchworked from different remnants." />
          <Field label="Preferred colours (hex, comma separated) — soft preference" htmlFor="p-col" hint="Matching material is used first when a piece fits; never blocks production.">
            <Input id="p-col" value={d.preferredColors.join(", ")} onChange={(e) => set({ preferredColors: e.target.value.split(",").map((x) => x.trim()).filter((x) => /^#[0-9a-f]{6}$/i.test(x)) })} placeholder="#2c3e5c, #3d5a80" />
          </Field>
          <Field label="Assembly notes" htmlFor="p-notes"><Textarea id="p-notes" value={d.assemblyNotes} onChange={(e) => set({ assemblyNotes: e.target.value })} /></Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label-caps">Pattern preview</span>
          <div className="border border-line bg-canvas tech-grid p-2"><PatternPreview p={d} className="w-full h-[260px]" /></div>
          <div className="text-[11.5px] text-muted num">
            {d.pieces.reduce((s, p) => s + (p.quantity || 0), 0)} pieces per product · cut area {(cutArea / 1e6).toFixed(4)} m²
          </div>
          <p className="text-[11px] text-muted">Solid = finished size. Dashed = cut line incl. {d.seamAllowance} mm seam allowance. Arrow = required grain.</p>
        </div>
      </div>
    </Dialog>
  );
}
