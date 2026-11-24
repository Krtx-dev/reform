import type { MaterialInstance, OptimizationResult, ProductTemplate } from "../domain/types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/**
 * Cutting layout as SVG with true physical size: 1 user unit = 1 mm and the root
 * element declares width/height in mm, so printing at 100 % reproduces real dimensions.
 * Material instances are stacked vertically with a 60 mm gutter.
 */
export function cuttingLayoutSvg(result: OptimizationResult, products: ProductTemplate[], opts: { title?: string } = {}): string {
  const used = new Set(result.placements.map((p) => p.instanceId));
  const instances = result.instances.filter((i) => used.has(i.id));
  const gutter = 60;
  const header = 80;
  const width = Math.max(400, ...instances.map((i) => i.width)) + 2 * gutter;
  const offsets = new Map<string, number>();
  let y = header;
  for (const inst of instances) {
    offsets.set(inst.id, y + 24);
    y += inst.height + 24 + gutter;
  }
  const height = y + 40;
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" font-family="monospace">`);
  parts.push(`<title>${esc(opts.title ?? "REFORM cutting layout")}</title>`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${gutter}" y="30" font-size="16" fill="#171A17">${esc(opts.title ?? "REFORM cutting layout")} — units: mm — 1 unit = 1 mm</text>`);
  parts.push(`<text x="${gutter}" y="50" font-size="10" fill="#666C64">Illustrative layout. Verify dimensions, grain and fabric behaviour before production cutting.</text>`);
  // 100 mm scale bar
  parts.push(`<g><line x1="${width - gutter - 100}" y1="40" x2="${width - gutter}" y2="40" stroke="#171A17" stroke-width="1.5"/><line x1="${width - gutter - 100}" y1="35" x2="${width - gutter - 100}" y2="45" stroke="#171A17"/><line x1="${width - gutter}" y1="35" x2="${width - gutter}" y2="45" stroke="#171A17"/><text x="${width - gutter - 100}" y="30" font-size="10">100 mm scale</text></g>`);
  for (const inst of instances) parts.push(instanceGroup(inst, offsets.get(inst.id)!, gutter, result, pname));
  parts.push(`</svg>`);
  return parts.join("\n");
}

function instanceGroup(inst: MaterialInstance, oy: number, ox: number, result: OptimizationResult, pname: Map<string, string>): string {
  const out: string[] = [];
  out.push(`<g id="${esc(inst.id)}" transform="translate(${ox} ${oy})">`);
  out.push(`<text x="0" y="-8" font-size="11" fill="#171A17">${esc(inst.id)} · ${esc(inst.name)} · ${inst.width}×${inst.height} mm · ${inst.fabricType} · grain ${inst.grain}</text>`);
  out.push(`<rect x="0" y="0" width="${inst.width}" height="${inst.height}" fill="none" stroke="#171A17" stroke-width="1"/>`);
  for (const d of inst.defects)
    out.push(`<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="none" stroke="#B94D44" stroke-width="0.8" stroke-dasharray="4 2"/><text x="${d.x + 2}" y="${d.y + 10}" font-size="7" fill="#B94D44">DEFECT</text>`);
  for (const p of result.placements.filter((q) => q.instanceId === inst.id)) {
    const label = `${pname.get(p.productId) ?? p.productId} · ${p.pieceName}`;
    out.push(`<g id="${esc(p.id)}">`);
    out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="#214D38" stroke-width="0.8"/>`);
    const fs = Math.max(5, Math.min(10, p.w / 18));
    out.push(`<text x="${p.x + 4}" y="${p.y + fs + 3}" font-size="${fs}" fill="#214D38">${esc(label)}</text>`);
    out.push(`<text x="${p.x + 4}" y="${p.y + 2 * fs + 5}" font-size="${fs * 0.85}" fill="#666C64">${esc(p.unitId)} · ${p.w}×${p.h}${p.rotated ? " · R90" : ""}</text>`);
    // grain arrow along the material grain direction, if any
    if (inst.grain !== "none" && p.w > 30 && p.h > 30) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2 + fs;
      const L = Math.min(inst.grain === "x" ? p.w : p.h, 120) * 0.35;
      if (inst.grain === "x") out.push(`<path d="M${cx - L} ${cy} L${cx + L} ${cy} M${cx + L - 6} ${cy - 4} L${cx + L} ${cy} L${cx + L - 6} ${cy + 4}" stroke="#666C64" stroke-width="0.7" fill="none"/>`);
      else out.push(`<path d="M${cx} ${cy - L} L${cx} ${cy + L} M${cx - 4} ${cy + L - 6} L${cx} ${cy + L} L${cx + 4} ${cy + L - 6}" stroke="#666C64" stroke-width="0.7" fill="none"/>`);
    }
    out.push(`</g>`);
  }
  out.push(`</g>`);
  return out.join("\n");
}
