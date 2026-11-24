"use client";

import type { ProductionPlan, ProductTemplate } from "@/core/domain/types";
import { OBJECTIVE_FORMULAS } from "@/core/optimization/objective";
import { ALGORITHM_LABELS } from "@/core/optimization/engine";
import { productColorMap } from "@/components/canvas/layout";
import { planConsumption } from "@/core/production/commit";

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Manufacturing report PDF (A4, vector layout diagrams). jsPDF is loaded on demand. */
export async function planPdf(plan: ProductionPlan, products: ProductTemplate[], currency: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const r = plan.result;
  const m = r.metrics;
  const W = 210;
  const M = 14;
  let y = M;
  const pname = new Map([...plan.request.products, ...products].map((p) => [p.id, p.name]));
  const colors = productColorMap(plan.request.products.map((p) => p.id));

  const line = (txt: string, size = 9, bold = false, color: [number, number, number] = [23, 26, 23]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(txt, W - 2 * M) as string[];
    for (const l of lines) {
      if (y > 285) {
        doc.addPage();
        y = M;
      }
      doc.text(l, M, y);
      y += size * 0.45;
    }
  };
  const gap = (h = 3) => (y += h);
  const kv = (rows: [string, string][]) => {
    doc.setFontSize(8.5);
    for (const [k, v] of rows) {
      if (y > 285) {
        doc.addPage();
        y = M;
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(95, 101, 93);
      doc.text(k, M, y);
      doc.setFont("courier", "normal");
      doc.setTextColor(23, 26, 23);
      doc.text(v, M + 70, y);
      y += 4.2;
    }
  };

  // Header band
  doc.setFillColor(24, 29, 25);
  doc.rect(0, 0, W, 24, "F");
  doc.setTextColor(203, 243, 106);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("REFORM · Manufacturing report", M, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(232, 234, 227);
  doc.text(`${plan.name} · ${plan.status.toUpperCase()} · ${new Date(plan.createdAt).toLocaleString()} · plan ${plan.id}`, M, 18);
  y = 32;

  line("Summary", 11, true);
  gap(1);
  kv([
    ["Complete products", String(m.productsCompleted)],
    ["Material utilization", `${(m.utilization * 100).toFixed(2)} % (cut area / eligible usable area)`],
    ["Eligible usable area", `${(m.eligibleUsableArea / 1e6).toFixed(3)} m²`],
    ["Allocated cut-pattern area", `${(m.usedCutArea / 1e6).toFixed(3)} m²`],
    ["Net finished product area", `${(m.netProductArea / 1e6).toFixed(3)} m²`],
    ["Unallocated area", `${(m.unallocatedArea / 1e6).toFixed(3)} m²`],
    ["Excluded defect area", `${(m.defectArea / 1e6).toFixed(4)} m²`],
    ["Estimated mass allocated", m.allocatedMassKg == null ? "unknown (no GSM)" : `${m.allocatedMassKg.toFixed(2)} kg (GSM known for ${(m.massCoverage * 100).toFixed(0)} % of area)`],
    ["Replacement value of allocated material", m.replacementValue == null ? "unknown" : `${currency}${m.replacementValue.toFixed(2)} (cost known for ${(m.costCoverage * 100).toFixed(0)} %)`],
    ["Estimated production value", `${currency}${m.productionValue.toFixed(2)} (illustrative)`],
    ["Material pieces used", `${m.instancesUsed} of ${r.instances.length}`],
  ]);
  gap(2);
  line("Optimization settings", 11, true);
  gap(1);
  const c = plan.request.constraints;
  kv([
    ["Algorithm", `${ALGORITHM_LABELS[r.algorithm]} — ${r.strategy}`],
    ["Objective", `${OBJECTIVE_FORMULAS[r.objective].label}: ${OBJECTIVE_FORMULAS[r.objective].formula}`],
    ["Score / iterations / runtime", `${r.score.toFixed(4)} / ${r.iterations} / ${(r.runtimeMs / 1000).toFixed(2)} s`],
    ["Seed / input hash", `${r.seed} / ${r.inputHash}`],
    ["Clearance / edge margin", `${c.clearance} mm / ${c.edgeMargin} mm`],
    ["Rotation / grain", `${c.allowRotation ? "allowed where permitted" : "disabled"} / ${c.respectGrain ? "enforced" : "ignored"}`],
  ]);
  gap(2);
  line("Validation", 11, true);
  gap(1);
  for (const ch of r.validation.checks) line(`${ch.passed ? "PASS" : "FAIL"}  ${ch.label} — ${ch.detail}`, 8.5, false, ch.passed ? [33, 77, 56] : [185, 77, 68]);
  gap(2);
  line("Products", 11, true);
  gap(1);
  kv(m.byProduct.map((p) => [p.productName, `${p.units} of ${p.demanded} requested · ${(p.cutArea / 1e6).toFixed(3)} m²`] as [string, string]));
  gap(2);
  line("Material consumed if committed", 11, true);
  gap(1);
  kv(planConsumption(plan).map((l) => [`${l.remnantId} ${l.name}`, `${l.pieces} piece(s)`] as [string, string]));

  // Layout diagrams: one per used instance, scaled to fit
  const used = r.instances.filter((i) => r.placements.some((p) => p.instanceId === i.id));
  doc.addPage();
  y = M;
  line("Cutting layouts (scaled — use the SVG export for true-size templates)", 11, true);
  gap(2);
  const maxW = W - 2 * M;
  for (const inst of used) {
    const scale = Math.min(maxW / inst.width, 70 / inst.height);
    const h = inst.height * scale;
    if (y + h + 10 > 287) {
      doc.addPage();
      y = M;
    }
    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(23, 26, 23);
    doc.text(`${inst.id} · ${inst.name} · ${inst.width}×${inst.height} mm · ${inst.fabricType} · grain ${inst.grain}`, M, y + 3);
    y += 5;
    doc.setDrawColor(23, 26, 23);
    doc.setLineWidth(0.2);
    doc.rect(M, y, inst.width * scale, h);
    for (const d of inst.defects) {
      doc.setFillColor(246, 225, 222);
      doc.setDrawColor(185, 77, 68);
      doc.rect(M + d.x * scale, y + d.y * scale, d.w * scale, d.h * scale, "FD");
    }
    for (const p of r.placements.filter((q) => q.instanceId === inst.id)) {
      const [cr, cg, cb] = hexToRgb(colors.get(p.productId) ?? "#2f6b4c");
      doc.setFillColor(cr, cg, cb);
      doc.setDrawColor(255, 255, 255);
      doc.rect(M + p.x * scale, y + p.y * scale, p.w * scale, p.h * scale, "FD");
      if (p.w * scale > 14 && p.h * scale > 5) {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.5);
        doc.text(`${pname.get(p.productId) ?? ""} ${p.pieceName}`.slice(0, Math.floor(p.w * scale / 1.3)), M + p.x * scale + 1, y + p.y * scale + 3);
        doc.text(`${p.w}×${p.h}${p.rotated ? " R" : ""}`, M + p.x * scale + 1, y + p.y * scale + 5.5);
      }
    }
    y += h + 6;
  }

  // Cut list
  doc.addPage();
  y = M;
  line("Cut list", 11, true);
  gap(1);
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.setTextColor(23, 26, 23);
  doc.text("UNIT            PIECE                MATERIAL      X     Y     W     H  ROT", M, y);
  y += 3.6;
  for (const p of [...r.placements].sort((a, b) => a.unitId.localeCompare(b.unitId))) {
    if (y > 287) {
      doc.addPage();
      y = M;
    }
    const row = `${p.unitId.padEnd(15).slice(0, 15)} ${`${p.pieceName}#${p.copyIndex}`.padEnd(20).slice(0, 20)} ${p.instanceId.padEnd(12).slice(0, 12)} ${String(p.x).padStart(5)} ${String(p.y).padStart(5)} ${String(p.w).padStart(5)} ${String(p.h).padStart(5)}  ${p.rotated ? "90" : "0"}`;
    doc.text(row, M, y);
    y += 3.3;
  }

  gap(4);
  line("Limitations", 11, true);
  gap(1);
  line("This plan was produced by heuristic optimization (not guaranteed globally optimal) over rectangular cut regions. Product templates are illustrative. Material figures describe allocation in a proposed plan, not verified landfill diversion. Mass estimates use the GSM entered for each material. Layouts require practical production verification (fabric shrinkage, stretch, print alignment, cutting tool tolerance) before industrial use. Data is synthetic when generated from the demonstration factory.", 8);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(95, 101, 93);
    doc.text(`REFORM · ${plan.name} · page ${i}/${pages}`, M, 293);
  }
  return doc.output("blob");
}
