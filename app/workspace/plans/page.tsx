"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, FileDown, FileJson, FileSpreadsheet, FileType2, Loader2, Lock, Trash2, Upload } from "lucide-react";
import type { ProductionPlan } from "@/core/domain/types";
import { cuttingLayoutSvg } from "@/core/exports/svg";
import { productionListCsv } from "@/core/exports/csv";
import { planConsumption } from "@/core/production/commit";
import { useWorkspace } from "@/stores/workspace";
import { useFormat, timeAgo } from "@/lib/format";
import { downloadBlob, downloadText, cn } from "@/lib/id";
import { planPdf } from "@/lib/pdf";
import { Button, Dialog, EmptyState, IconButton, Metric, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { LayoutThumb } from "@/components/canvas/LayoutThumb";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plan";

function PlansInner() {
  const ws = useWorkspace();
  const f = useFormat();
  const router = useRouter();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get("id"));
  const [confirmCommit, setConfirmCommit] = useState<ProductionPlan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProductionPlan | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedId && ws.plans[0]) setSelectedId(ws.plans[0].id);
  }, [ws.plans, selectedId]);
  const plan = ws.plans.find((p) => p.id === selectedId) ?? null;

  const exportSvg = (p: ProductionPlan) => downloadText(`${slug(p.name)}-cutting-layout.svg`, cuttingLayoutSvg(p.result, p.request.products, { title: `REFORM cutting layout — ${p.name}` }), "image/svg+xml");
  const exportCsv = (p: ProductionPlan) => downloadText(`${slug(p.name)}-cut-list.csv`, productionListCsv(p.result, p.request.products), "text/csv");
  const exportPdf = async (p: ProductionPlan) => {
    setPdfBusy(true);
    try {
      downloadBlob(`${slug(p.name)}-report.pdf`, await planPdf(p, ws.products, f.currency));
      toast.success("PDF report generated.");
    } catch (e) {
      toast.error(`PDF export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <PageHeader
        eyebrow="Production"
        title="Production plans"
        description="A plan freezes an optimization result together with its inventory snapshot and settings. Saving never touches inventory; committing deducts the material pieces once."
        actions={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Project JSON file" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; const res = await ws.importProject(await file.text()); if (res.ok) toast.success(res.message); else toast.error(res.message); }} />
            <Button icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Import project JSON</Button>
            <Button icon={<FileJson size={14} />} onClick={() => downloadText(`reform-project-${slug(ws.project?.name ?? "project")}.json`, ws.exportProject(), "application/json")} data-testid="export-project">Export project JSON</Button>
          </>
        }
      />
      {ws.plans.length === 0 ? (
        <EmptyState title="No production plans yet" body="Run the optimizer and press “Save plan” to keep a validated layout here." action={<Link href="/workspace/optimizer"><Button variant="primary">Open optimizer</Button></Link>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="border border-line bg-surface rounded-[3px] divide-y divide-line self-start" aria-label="Plans">
            {ws.plans.map((p) => (
              <li key={p.id}>
                <button onClick={() => { setSelectedId(p.id); router.replace(`/workspace/plans?id=${p.id}`); }} className={cn("w-full text-left px-3 py-2.5 hover:bg-surface-2", p.id === selectedId && "bg-surface-2 border-l-2 border-ink")} aria-current={p.id === selectedId}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium truncate">{p.name}</span>
                    {p.status === "committed" ? <Tag tone="green">committed</Tag> : <Tag>draft</Tag>}
                  </div>
                  <div className="text-[11px] text-muted num mt-0.5">{p.result.metrics.productsCompleted} products · {f.pct(p.result.metrics.utilization)} · {timeAgo(p.createdAt)}</div>
                </button>
              </li>
            ))}
          </ul>

          {plan && (
            <div className="flex flex-col gap-6 min-w-0">
              <Panel
                title={<span className="flex items-center gap-2">{plan.name} {plan.status === "committed" ? <Tag tone="green">committed {plan.committedAt ? timeAgo(plan.committedAt) : ""}</Tag> : <Tag>draft</Tag>}</span>}
                actions={
                  <>
                    <IconButton label="Delete plan" onClick={() => setConfirmDelete(plan)}><Trash2 size={14} /></IconButton>
                    {plan.status === "draft" ? (
                      <Button variant="primary" size="sm" icon={<Lock size={13} />} onClick={() => setConfirmCommit(plan)} data-testid="commit-plan">Commit to production</Button>
                    ) : (
                      <Button size="sm" variant="secondary" icon={<CheckCircle2 size={13} />} onClick={() => { const r = ws.commitPlan(plan.id); toast[r.ok ? "success" : "info"](r.message); }} data-testid="commit-plan-again">Committed</Button>
                    )}
                  </>
                }
              >
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Metric label="Utilization" value={f.pct(plan.result.metrics.utilization)} tone="lime" />
                  <Metric label="Products" value={plan.result.metrics.productsCompleted} />
                  <Metric label="Allocated" value={f.m2(plan.result.metrics.usedCutArea)} unit="m²" />
                  <Metric label="Est. mass" value={f.kg(plan.result.metrics.allocatedMassKg)} />
                  <Metric label="Validation" value={plan.result.validation.valid ? "PASS" : "FAIL"} sub={`${plan.result.validation.checks.length} checks`} />
                </div>
                <div className="mt-4 bg-canvas border border-line tech-grid p-2">
                  <LayoutThumb instances={plan.result.instances} placements={plan.result.placements} productIds={plan.request.products.map((p) => p.id)} className="w-full h-[300px]" />
                </div>
                {plan.notes && <p className="mt-3 text-[12.5px] text-muted">{plan.notes}</p>}
              </Panel>

              <div className="grid gap-6 md:grid-cols-2">
                <Panel title="Exports">
                  <div className="grid gap-2">
                    <Button className="justify-start" icon={<FileType2 size={14} />} onClick={() => exportSvg(plan)} data-testid="export-svg">SVG cutting layout · true mm scale</Button>
                    <Button className="justify-start" icon={pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} onClick={() => exportPdf(plan)} disabled={pdfBusy} data-testid="export-pdf">PDF manufacturing report</Button>
                    <Button className="justify-start" icon={<FileSpreadsheet size={14} />} onClick={() => exportCsv(plan)} data-testid="export-csv">CSV production cut list</Button>
                  </div>
                  <p className="mt-3 text-[11.5px] text-warn">Layouts are illustrative and require practical production verification before industrial use.</p>
                </Panel>
                <Panel title={plan.status === "committed" ? "Material consumed" : "Material consumed on commit"}>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {planConsumption(plan).map((l) => (
                        <tr key={l.remnantId} className="border-b border-line/60"><td className="py-1 font-mono text-[11px] text-muted">{l.remnantId}</td><td className="py-1">{l.name}</td><td className="py-1 text-right num">−{l.pieces}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11.5px] text-muted">Committing is idempotent: a committed plan can never deduct inventory a second time. Off-cuts are not automatically returned to inventory; add them as new remnants if kept.</p>
                </Panel>
              </div>

              <Panel title="Settings snapshot" bodyClass="p-0">
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {[
                      ["Algorithm", `${plan.result.algorithm} — ${plan.result.strategy}`],
                      ["Objective / score", `${plan.result.objective} / ${plan.result.score.toFixed(4)}`],
                      ["Seed / runtime / iterations", `${plan.result.seed} / ${f.ms(plan.result.runtimeMs)} / ${plan.result.iterations}`],
                      ["Clearance / margin", `${plan.request.constraints.clearance} mm / ${plan.request.constraints.edgeMargin} mm`],
                      ["Inventory snapshot", `${plan.request.remnants.length} lines, ${plan.result.instances.length} pieces`],
                      ["Input hash", plan.result.inputHash],
                    ].map(([k, v]) => (
                      <tr key={k} className="border-b border-line/60"><td className="px-4 py-1.5 text-muted w-56">{k}</td><td className="num">{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={!!confirmCommit}
        onClose={() => setConfirmCommit(null)}
        title="Commit plan to production"
        footer={
          <>
            <Button onClick={() => setConfirmCommit(null)}>Cancel</Button>
            <Button variant="primary" data-testid="confirm-commit" onClick={() => { if (confirmCommit) { const r = ws.commitPlan(confirmCommit.id); if (r.ok) toast.success(r.message); else toast.error(r.message); } setConfirmCommit(null); }}>Commit and deduct</Button>
          </>
        }
      >
        {confirmCommit && (
          <div className="text-[13px] flex flex-col gap-2">
            <p>This deducts the following material pieces from inventory. It can only happen once per plan.</p>
            <ul className="font-mono text-[12px]">{planConsumption(confirmCommit).map((l) => <li key={l.remnantId}>{l.remnantId} {l.name} · −{l.pieces}</li>)}</ul>
            <p className="text-muted text-[12px]">If the inventory changed since the plan was computed, the commit is refused.</p>
          </div>
        )}
      </Dialog>
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete plan" footer={<><Button onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { ws.deletePlan(confirmDelete.id); setSelectedId(null); } setConfirmDelete(null); }}>Delete</Button></>}>
        <p className="text-[13px]">Delete <strong>{confirmDelete?.name}</strong>? {confirmDelete?.status === "committed" && "Inventory deductions already made are not reversed."}</p>
      </Dialog>
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={null}>
      <PlansInner />
    </Suspense>
  );
}
