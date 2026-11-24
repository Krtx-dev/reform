"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Check, Circle } from "lucide-react";
import { expandInstances, requestHash } from "@/core/optimization/prepare";
import { instanceDefectArea } from "@/core/impact/metrics";
import { useWorkspace } from "@/stores/workspace";
import { useFormat, timeAgo } from "@/lib/format";
import { cn } from "@/lib/id";
import { Button, Metric, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { LayoutThumb } from "@/components/canvas/LayoutThumb";

export default function OverviewPage() {
  const ws = useWorkspace();
  const f = useFormat();
  const settings = ws.project!.settings;
  const req = useMemo(() => ws.buildRequest(), [ws.remnants, ws.products, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const instances = useMemo(() => expandInstances(ws.remnants), [ws.remnants]);
  const totalArea = instances.reduce((s, i) => s + i.width * i.height, 0);
  const defectArea = instances.reduce((s, i) => s + instanceDefectArea(i), 0);
  const fabrics = new Set(ws.remnants.map((r) => r.fabricType));
  const compatibleProducts = ws.products.filter((p) => p.allowedFabrics.some((x) => fabrics.has(x))).length;
  const result = settings.lastResult;
  const outdated = !!result && !!req && result.inputHash !== requestHash(req);
  const demandSet = ws.products.some((p) => (settings.demand[p.id]?.max ?? 0) > 0);
  const committed = ws.plans.filter((p) => p.status === "committed");

  const steps = [
    { done: ws.remnants.length > 0, label: "Digitize discarded material", body: "Add remnants by hand, CSV import or the photo scanner.", href: "/workspace/inventory" },
    { done: demandSet, label: "Choose products to manufacture", body: "Set quantities for pattern templates in the optimizer.", href: "/workspace/optimizer" },
    { done: !!result?.ok, label: "Run the optimizer", body: "Compute a validated cutting plan of complete products.", href: "/workspace/optimizer?run=1" },
    { done: ws.plans.length > 0, label: "Save a production plan", body: "Freeze the layout with its inventory snapshot.", href: "/workspace/optimizer" },
    { done: committed.length > 0, label: "Commit when cutting starts", body: "Deduct material from inventory exactly once.", href: "/workspace/plans" },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <div className="mx-auto max-w-[1280px] p-4 md:p-8">
      <PageHeader
        eyebrow={ws.project?.kind === "demo" ? "Demonstration factory · synthetic data" : "Workspace"}
        title="Operational overview"
        description="From discarded material to a validated manufacturing plan. Figures below are computed from the inventory in this browser."
        actions={
          <>
            <Link href="/workspace/inventory"><Button>Inventory</Button></Link>
            <Link href="/workspace/optimizer?run=1"><Button variant="primary" icon={<ArrowRight size={14} />}>Run optimization</Button></Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 border border-line bg-surface rounded-[3px] divide-x divide-y xl:divide-y-0 divide-line">
        <Metric className="p-4" label="Material area" value={f.m2(totalArea)} unit="m²" sub={`${f.m2(defectArea, 3)} m² in defects`} />
        <Metric className="p-4" label="Remnants" value={instances.length} sub={`${ws.remnants.length} lines · ${fabrics.size} fabric types`} />
        <Metric className="p-4" label="Compatible products" value={compatibleProducts} unit={`/ ${ws.products.length}`} sub="accept at least one fabric on hand" />
        <Metric className="p-4" label="Potential recovery" value={result?.ok ? f.pct(result.metrics.utilization) : "—"} tone={result?.ok && !outdated ? "lime" : "default"} sub={result?.ok ? `${f.area(result.metrics.usedCutArea)} into ${result.metrics.productsCompleted} products` : "run the optimizer"} />
        <Metric className="p-4" label="Unallocated" value={result?.ok ? f.m2(result.metrics.unallocatedArea) : "—"} unit={result?.ok ? "m²" : undefined} sub="eligible usable area not in a product" />
        <Metric className="p-4" label="Committed plans" value={committed.length} sub={`${ws.plans.length} plans saved`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel title="Workflow" actions={next ? <Tag tone="lime">next: {next.label.toLowerCase()}</Tag> : <Tag tone="green">complete</Tag>}>
          <ol className="flex flex-col">
            {steps.map((s, i) => (
              <li key={s.label} className={cn("flex items-start gap-3 py-3", i > 0 && "border-t border-line")}>
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border", s.done ? "bg-primary border-primary text-primary-ink" : s === next ? "border-ink" : "border-line-strong text-muted")}>
                  {s.done ? <Check size={12} /> : <span className="num text-[10px]">{i + 1}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-[13.5px] font-medium", s.done && "text-muted line-through decoration-1")}>{s.label}</div>
                  <div className="text-[12px] text-muted">{s.body}</div>
                </div>
                {s === next && (
                  <Link href={s.href}><Button size="sm" variant="primary">Start</Button></Link>
                )}
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          title="Most recent optimization"
          actions={result ? (outdated ? <Tag tone="warn">outdated</Tag> : result.ok ? <Tag tone="green">valid</Tag> : <Tag tone="err">failed</Tag>) : null}
        >
          {result?.ok ? (
            <div>
              <LayoutThumb instances={result.instances} placements={result.placements} productIds={ws.products.map((p) => p.id)} className="w-full h-[220px] bg-canvas border border-line" />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Metric label="Utilization" value={f.pct(result.metrics.utilization)} />
                <Metric label="Products" value={result.metrics.productsCompleted} />
                <Metric label="Runtime" value={f.ms(result.runtimeMs)} />
              </div>
              <p className="mt-3 text-[12px] text-muted">{result.strategy} · {timeAgo(result.createdAt)}{outdated && " · inputs have changed since this run"}</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 text-[13px] text-muted">
              <Circle size={18} />
              No optimization yet. The engine will allocate complete products to the remnants on hand.
              <Link href="/workspace/optimizer?run=1"><Button variant="primary" size="sm">Run now</Button></Link>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Recent production plans" actions={<Link href="/workspace/plans" className="text-[12.5px] text-primary hover:underline">All plans →</Link>} bodyClass="p-0">
        {ws.plans.length === 0 ? (
          <p className="p-4 text-[13px] text-muted">No plans saved. Run the optimizer and choose “Save plan”.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] text-muted"><tr className="border-b border-line"><th className="px-4 py-2 font-normal">Plan</th><th className="font-normal">Status</th><th className="font-normal text-right">Products</th><th className="font-normal text-right">Utilization</th><th className="font-normal text-right px-4">Created</th></tr></thead>
            <tbody>
              {ws.plans.slice(0, 5).map((p) => (
                <tr key={p.id} className="border-b border-line/60 hover:bg-surface-2">
                  <td className="px-4 py-2"><Link className="hover:underline" href={`/workspace/plans?id=${p.id}`}>{p.name}</Link></td>
                  <td>{p.status === "committed" ? <Tag tone="green">committed</Tag> : <Tag>draft</Tag>}</td>
                  <td className="text-right num">{p.result.metrics.productsCompleted}</td>
                  <td className="text-right num">{f.pct(p.result.metrics.utilization)}</td>
                  <td className="text-right px-4 text-muted">{timeAgo(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
