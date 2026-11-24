"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProductTemplate } from "@/core/domain/types";
import { availableQuantity } from "@/core/optimization/prepare";
import { useWorkspace } from "@/stores/workspace";
import { useFormat } from "@/lib/format";
import { Button, Dialog, EmptyState, IconButton, PageHeader, Tag } from "@/components/ui/primitives";
import { ProductEditor } from "@/components/products/ProductEditor";
import { PatternPreview } from "@/components/products/PatternPreview";

function ProductsInner() {
  const ws = useWorkspace();
  const f = useFormat();
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState<ProductTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<ProductTemplate | null>(null);
  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(null);
      setOpen(true);
      router.replace("/workspace/products");
    }
  }, [params, router]);

  const fabricsOnHand = (p: ProductTemplate) => ws.remnants.filter((r) => p.allowedFabrics.includes(r.fabricType)).reduce((s, r) => s + availableQuantity(r), 0);

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <PageHeader
        eyebrow="Pattern library"
        title="Product templates"
        description="Each product is a set of rectangular pattern pieces with seam allowance, grain and rotation rules. A product only counts as manufacturable when every piece is placed. Built-in templates are illustrative, not validated for industrial production."
        actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-product">Create product</Button>}
      />
      {ws.products.length === 0 ? (
        <EmptyState title="No product templates" body="Create a product from rectangular pattern pieces to start optimizing." action={<Button variant="primary" onClick={() => setOpen(true)}>Create product</Button>} />
      ) : (
        <div className="grid gap-px bg-line border border-line md:grid-cols-2 xl:grid-cols-3">
          {ws.products.map((p) => {
            const pieces = p.pieces.reduce((s, x) => s + x.quantity, 0);
            const cut = p.pieces.reduce((s, x) => s + (x.width + 2 * p.seamAllowance) * (x.height + 2 * p.seamAllowance) * x.quantity, 0);
            const net = p.pieces.reduce((s, x) => s + x.width * x.height * x.quantity, 0);
            const onHand = fabricsOnHand(p);
            const demand = ws.project?.settings.demand[p.id]?.max ?? 0;
            return (
              <article key={p.id} className="bg-surface p-4 flex flex-col" data-testid="product-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="label-caps">{p.category}{p.builtin ? " · built-in" : " · custom"}</div>
                    <h2 className="text-[15px] font-semibold mt-0.5">{p.name}</h2>
                    <p className="text-[12px] text-muted mt-0.5 line-clamp-2">{p.description}</p>
                  </div>
                  <div className="flex shrink-0">
                    <IconButton label={`Edit ${p.name}`} onClick={() => { setEditing(p); setOpen(true); }}><Pencil size={14} /></IconButton>
                    <IconButton label={`Duplicate ${p.name}`} onClick={() => { ws.duplicateProduct(p.id); toast.success("Duplicated as a custom product."); }}><Copy size={14} /></IconButton>
                    <IconButton label={`Delete ${p.name}`} onClick={() => setDel(p)}><Trash2 size={14} /></IconButton>
                  </div>
                </div>
                <div className="mt-3 border border-line bg-canvas tech-grid p-2"><PatternPreview p={p} className="w-full h-[150px]" /></div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div><dt className="label-caps">Pieces</dt><dd className="num">{pieces}</dd></div>
                  <div><dt className="label-caps">Cut area</dt><dd className="num">{f.m2(cut, 3)} m²</dd></div>
                  <div><dt className="label-caps">Net / cut</dt><dd className="num">{f.pct(net / cut, 0)}</dd></div>
                  <div><dt className="label-caps">Seam</dt><dd className="num">{p.seamAllowance} mm</dd></div>
                  <div><dt className="label-caps">Value</dt><dd className="num">{f.money(p.value, 0)}</dd></div>
                  <div><dt className="label-caps">Demand</dt><dd className="num">{demand}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.allowedFabrics.map((x) => <Tag key={x}>{x}</Tag>)}
                  {p.matchFabric && <Tag tone="warn">matched fabric</Tag>}
                  {p.pieces.some((x) => !x.allowRotation) && <Tag tone="warn">rotation-restricted</Tag>}
                  {p.pieces.some((x) => x.approximated) && <Tag tone="warn">≈ enclosing rect</Tag>}
                </div>
                <div className="mt-auto pt-3 text-[11.5px]">
                  {onHand > 0 ? <span className="text-primary">{onHand} compatible material pieces on hand</span> : <span className="text-err">No compatible material in inventory</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ProductEditor open={open} initial={editing} onClose={() => setOpen(false)} onSaved={(p) => toast.success(`Saved ${p.name}. Set a quantity in the optimizer to include it.`)} />
      <Dialog open={!!del} onClose={() => setDel(null)} title="Delete product" footer={<><Button onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (del) ws.deleteProduct(del.id); setDel(null); }}>Delete</Button></>}>
        <p className="text-[13px]">Delete <strong>{del?.name}</strong>? It will be removed from optimizer demand. Saved plans keep their own copy.</p>
      </Dialog>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsInner />
    </Suspense>
  );
}
