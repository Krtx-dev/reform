"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { ArrowDownUp, Copy, Download, LayoutGrid, Lock, Minus, Pencil, Plus, Rows3, Trash2, Upload } from "lucide-react";
import { FABRIC_TYPES, type MaterialRemnant } from "@/core/domain/types";
import { availableQuantity } from "@/core/optimization/prepare";
import { instanceDefectArea } from "@/core/impact/metrics";
import { inventoryCsv, parseInventoryCsv } from "@/core/exports/csv";
import { useWorkspace } from "@/stores/workspace";
import { useFormat } from "@/lib/format";
import { downloadText, uid, cn } from "@/lib/id";
import { Button, Dialog, EmptyState, IconButton, Input, PageHeader, Segmented, Select, Swatch, Tag } from "@/components/ui/primitives";
import { RemnantForm } from "@/components/inventory/RemnantForm";
import { RemnantPreview } from "@/components/inventory/RemnantPreview";

type SortKey = "createdAt" | "name" | "area" | "quantity" | "fabricType";

function InventoryInner() {
  const ws = useWorkspace();
  const f = useFormat();
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<"table" | "grid">("table");
  const [q, setQ] = useState("");
  const [fabric, setFabric] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "available" | "reserved" | "depleted" | "defects">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: 1 });
  const [editing, setEditing] = useState<MaterialRemnant | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<MaterialRemnant | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(null);
      setFormOpen(true);
      router.replace("/workspace/inventory");
    }
  }, [params, router]);

  const productsFor = (r: MaterialRemnant) => ws.products.filter((p) => p.allowedFabrics.includes(r.fabricType));

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = ws.remnants.filter((r) => {
      if (fabric !== "all" && r.fabricType !== fabric) return false;
      if (status === "available" && availableQuantity(r) === 0) return false;
      if (status === "reserved" && r.reserved === 0) return false;
      if (status === "depleted" && r.quantity > 0) return false;
      if (status === "defects" && r.defects.length === 0) return false;
      if (!ql) return true;
      return [r.id, r.name, r.fabricType, r.colorName, r.batchId, r.location, r.notes].some((x) => x?.toLowerCase().includes(ql));
    });
    const val = (r: MaterialRemnant) => (sort.key === "area" ? r.width * r.height * r.quantity : sort.key === "name" ? r.name.toLowerCase() : r[sort.key]);
    list = [...list].sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0));
    return list;
  }, [ws.remnants, q, fabric, status, sort]);

  const totals = useMemo(() => {
    let area = 0, avail = 0, pieces = 0, defect = 0;
    for (const r of ws.remnants) {
      area += r.width * r.height * r.quantity;
      avail += r.width * r.height * availableQuantity(r);
      pieces += r.quantity;
      defect += instanceDefectArea(r) * r.quantity;
    }
    return { area, avail, pieces, defect };
  }, [ws.remnants]);

  const sortBtn = (key: SortKey, label: string, cls = "") => (
    <th className={cn("font-normal", cls)}>
      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))} aria-label={`Sort by ${label}`}>
        {label} {sort.key === key && <ArrowDownUp size={11} />}
      </button>
    </th>
  );

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const res = parseInventoryCsv(text, () => uid("M-"));
    if (res.remnants.length) ws.addRemnants(res.remnants);
    if (res.errors.length) toast.warning(`Imported ${res.remnants.length} rows; ${res.errors.length} skipped`, { description: res.errors.slice(0, 4).join(" · ") });
    else toast.success(`Imported ${res.remnants.length} materials from ${file.name}.`);
    setImportOpen(false);
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <PageHeader
        eyebrow="Material library"
        title="Digital material inventory"
        description="Every remnant is stored as a certified rectangular usable region in integer millimetres, with defects, grain and rotation rules. Inventory only changes when a production plan is committed."
        actions={
          <>
            <Button icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>Import CSV</Button>
            <Button icon={<Download size={14} />} disabled={!ws.remnants.length} onClick={() => downloadText(`reform-inventory-${new Date().toISOString().slice(0, 10)}.csv`, inventoryCsv(ws.remnants), "text/csv")}>Export CSV</Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="add-remnant">Add material</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 border border-line bg-surface rounded-[3px] divide-x divide-line">
        {[
          ["Total area on hand", f.area(totals.area)],
          ["Available for optimization", f.area(totals.avail)],
          ["Physical pieces", String(totals.pieces)],
          ["Defect area", f.area(totals.defect, 3)],
        ].map(([k, v]) => (
          <div key={k} className="px-4 py-3"><div className="label-caps">{k}</div><div className="num text-[18px] mt-0.5">{v}</div></div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-[260px]" placeholder="Search name, ID, batch, location…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
        <Select className="!w-[150px]" value={fabric} onChange={(e) => setFabric(e.target.value)} aria-label="Filter by fabric">
          <option value="all">All fabrics</option>
          {FABRIC_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
        <Select className="!w-[160px]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Has reserved</option>
          <option value="depleted">Depleted</option>
          <option value="defects">With defects</option>
        </Select>
        <span className="text-[12px] text-muted num">{rows.length} of {ws.remnants.length}</span>
        <div className="flex-1" />
        <Segmented label="Layout" value={view} onChange={setView} options={[{ value: "table", label: <span className="flex items-center gap-1"><Rows3 size={12} /> Table</span> }, { value: "grid", label: <span className="flex items-center gap-1"><LayoutGrid size={12} /> Grid</span> }]} />
      </div>

      {ws.remnants.length === 0 ? (
        <EmptyState
          title="No material yet"
          body="Add discarded fabric by hand, import a CSV, or photograph it with the scanner. REFORM starts from what you already have."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>Add material</Button>
              <Button onClick={() => router.push("/workspace/scanner")}>Open scanner</Button>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No matches" body="No remnant matches the current search and filters." action={<Button onClick={() => { setQ(""); setFabric("all"); setStatus("all"); }}>Clear filters</Button>} />
      ) : view === "table" ? (
        <div className="overflow-x-auto border border-line bg-surface rounded-[3px]">
          <table className="w-full min-w-[980px] text-[13px]" data-testid="inventory-table">
            <thead className="text-left text-[11px] text-muted">
              <tr className="border-b border-line h-9">
                <th className="w-[88px] pl-3 font-normal">Shape</th>
                {sortBtn("name", "Material")}
                {sortBtn("fabricType", "Fabric")}
                <th className="font-normal">Dimensions</th>
                {sortBtn("quantity", "Qty", "text-right")}
                {sortBtn("area", "Area", "text-right")}
                <th className="font-normal pl-4">Rules</th>
                <th className="font-normal">Compatible</th>
                <th className="font-normal text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((r) => {
                  const avail = availableQuantity(r);
                  const prods = productsFor(r);
                  return (
                    <motion.tr key={r.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="border-b border-line/60 hover:bg-surface-2/60">
                      <td className="pl-3 py-1.5"><RemnantPreview r={r} className="h-12 w-[72px]" showDims={false} /></td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2"><Swatch color={r.color} /><span className="font-medium">{r.name}</span></div>
                        <div className="text-[11px] text-muted font-mono">{r.id} · {r.batchId || "no batch"} · {r.location || "—"}</div>
                      </td>
                      <td><Tag>{r.fabricType}</Tag>{r.gsm && <div className="text-[11px] text-muted num mt-0.5">{r.gsm} gsm</div>}</td>
                      <td className="num text-[12.5px]">{f.dims(r.width, r.height)}</td>
                      <td className="text-right num">
                        <div className="inline-flex items-center gap-1">
                          <IconButton className="h-6 w-6" label={`Decrease quantity of ${r.name}`} onClick={() => ws.adjustQuantity(r.id, -1)} disabled={r.quantity === 0}><Minus size={12} /></IconButton>
                          <span className="w-6 text-center">{r.quantity}</span>
                          <IconButton className="h-6 w-6" label={`Increase quantity of ${r.name}`} onClick={() => ws.adjustQuantity(r.id, 1)}><Plus size={12} /></IconButton>
                        </div>
                        <div className="text-[10.5px] text-muted">{avail} avail{r.reserved ? ` · ${r.reserved} res.` : ""}{r.consumed ? ` · ${r.consumed} used` : ""}</div>
                      </td>
                      <td className="text-right num text-[12.5px]">{f.m2(r.width * r.height * r.quantity, 3)} m²</td>
                      <td className="pl-4">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {r.defects.length > 0 && <Tag tone="err">{r.defects.length} defect</Tag>}
                          {!r.allowRotation && <Tag tone="warn">no rot.</Tag>}
                          {r.grain !== "none" && <Tag>grain {r.grain}</Tag>}
                          {r.source === "scanner" && <Tag tone="warn">estimate</Tag>}
                          {r.quantity === 0 && <Tag tone="dark">depleted</Tag>}
                        </div>
                      </td>
                      <td className="text-[11.5px] text-muted max-w-[180px]" title={prods.map((p) => p.name).join(", ")}>{prods.length ? `${prods.length} product${prods.length > 1 ? "s" : ""}` : <span className="text-err">none</span>}</td>
                      <td className="text-right pr-2 whitespace-nowrap">
                        <IconButton label={r.reserved >= r.quantity ? `Unreserve ${r.name}` : `Reserve one ${r.name}`} title="Reserve one piece (excluded from optimization); click again when all are reserved to release" onClick={() => ws.upsertRemnant({ ...r, reserved: r.reserved >= r.quantity ? 0 : r.reserved + 1 })}><Lock size={14} /></IconButton>
                        <IconButton label={`Edit ${r.name}`} onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil size={14} /></IconButton>
                        <IconButton label={`Duplicate ${r.name}`} onClick={() => { ws.duplicateRemnant(r.id); toast.success("Duplicated."); }}><Copy size={14} /></IconButton>
                        <IconButton label={`Delete ${r.name}`} onClick={() => setConfirmDel(r)}><Trash2 size={14} /></IconButton>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-px bg-line border border-line">
          {rows.map((r) => (
            <motion.button layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} key={r.id} onClick={() => { setEditing(r); setFormOpen(true); }} className="bg-surface p-3 text-left hover:bg-surface-2">
              <div className="tech-grid bg-canvas"><RemnantPreview r={r} className="w-full h-36" /></div>
              <div className="mt-2 flex items-center gap-1.5"><Swatch color={r.color} size={11} /><span className="text-[12.5px] font-medium truncate">{r.name}</span></div>
              <div className="text-[11px] text-muted num">{r.id} · ×{r.quantity} · {r.fabricType}</div>
            </motion.button>
          ))}
        </div>
      )}

      <RemnantForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSaved={(r) => toast.success(`Saved ${r.name}.`)} />

      <Dialog open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete material" footer={<><Button onClick={() => setConfirmDel(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDel) { ws.deleteRemnant(confirmDel.id); toast.success(`Deleted ${confirmDel.name}.`); } setConfirmDel(null); }}>Delete</Button></>}>
        <p className="text-[13px]">Delete <strong>{confirmDel?.name}</strong> ({confirmDel?.quantity} pieces) from this workspace? Saved plans keep their own inventory snapshot.</p>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import inventory from CSV">
        <div className="flex flex-col gap-3 text-[13px]">
          <p>Required columns: <code className="font-mono text-[12px]">name, fabric_type, width, height</code>. Optional: <code className="font-mono text-[12px]">unit</code> (mm/cm/m), quantity, reserved, gsm, color (hex), color_name, grain (x/y/none), allow_rotation (yes/no), condition, batch_id, location, replacement_cost, notes, defects (<code className="font-mono">x;y;w;h|…</code> in mm).</p>
          <p className="text-muted text-[12px]">Each row is validated; invalid rows are skipped and reported. Exported inventory CSV files can be re-imported.</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onImportFile(file); e.target.value = ""; }} aria-label="CSV file" />
          <div className="flex gap-2">
            <Button variant="primary" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <Button onClick={() => downloadText("reform-inventory-template.csv", "name,fabric_type,width,height,unit,quantity,gsm,color,grain,allow_rotation,defects\nDenim offcut,denim,120,60,cm,2,380,#2c3e5c,x,yes,100;100;50;40\n", "text/csv")}>Download template</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryInner />
    </Suspense>
  );
}
