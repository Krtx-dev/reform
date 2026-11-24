import type { FabricType, MaterialRemnant, OptimizationResult, ProductTemplate } from "../domain/types";
import { CONDITIONS, FABRIC_TYPES } from "../domain/types";
import { toMm, type LengthUnit } from "../domain/units";

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

/** Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function productionListCsv(result: OptimizationResult, products: ProductTemplate[]): string {
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const inst = new Map(result.instances.map((i) => [i.id, i]));
  const rows: unknown[][] = [["product_unit", "product_id", "product_name", "piece_id", "piece_name", "copy", "material_instance", "material_name", "fabric", "x_mm", "y_mm", "cut_width_mm", "cut_height_mm", "rotated_90", "cut_area_mm2"]];
  for (const p of [...result.placements].sort((a, b) => a.unitId.localeCompare(b.unitId) || a.seq - b.seq)) {
    const i = inst.get(p.instanceId);
    rows.push([p.unitId, p.productId, pname.get(p.productId) ?? "", p.pieceId, p.pieceName, p.copyIndex, p.instanceId, i?.name ?? "", i?.fabricType ?? "", p.x, p.y, p.w, p.h, p.rotated ? "yes" : "no", p.w * p.h]);
  }
  return toCsv(rows);
}

export const INVENTORY_HEADERS = ["id", "name", "fabric_type", "color", "color_name", "width", "height", "unit", "quantity", "reserved", "gsm", "thickness_mm", "condition", "batch_id", "grain", "allow_rotation", "location", "replacement_cost", "notes", "defects"] as const;

export function inventoryCsv(remnants: MaterialRemnant[]): string {
  const rows: unknown[][] = [[...INVENTORY_HEADERS]];
  for (const r of remnants)
    rows.push([r.id, r.name, r.fabricType, r.color, r.colorName, r.width, r.height, "mm", r.quantity, r.reserved, r.gsm ?? "", r.thicknessMm ?? "", r.condition, r.batchId, r.grain, r.allowRotation ? "yes" : "no", r.location, r.replacementCost ?? "", r.notes, r.defects.map((d) => `${d.x};${d.y};${d.w};${d.h}`).join("|")]);
  return toCsv(rows);
}

export interface CsvImportResult {
  remnants: MaterialRemnant[];
  errors: string[];
}

/** Parse an inventory CSV. Rows with errors are skipped and reported; valid rows are returned. */
export function parseInventoryCsv(text: string, makeId: () => string, at = Date.now()): CsvImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { remnants: [], errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const req of ["name", "fabric_type", "width", "height"]) if (col(req) < 0) errors.push(`Missing required column "${req}".`);
  if (errors.length) return { remnants: [], errors };
  const get = (row: string[], name: string) => (col(name) >= 0 ? (row[col(name)] ?? "").trim() : "");
  const out: MaterialRemnant[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const unit = (get(row, "unit") || "mm") as LengthUnit;
    if (!["mm", "cm", "m"].includes(unit)) return errors.push(`Row ${line}: unit must be mm, cm or m.`);
    const width = toMm(Number(get(row, "width")), unit);
    const height = toMm(Number(get(row, "height")), unit);
    if (!(width > 0 && height > 0)) return errors.push(`Row ${line}: width and height must be positive numbers.`);
    const fabric = get(row, "fabric_type").toLowerCase() as FabricType;
    if (!FABRIC_TYPES.includes(fabric)) return errors.push(`Row ${line}: unknown fabric type "${fabric}".`);
    const qty = get(row, "quantity") === "" ? 1 : Number(get(row, "quantity"));
    if (!Number.isInteger(qty) || qty < 0) return errors.push(`Row ${line}: quantity must be a non-negative integer.`);
    const reserved = get(row, "reserved") === "" ? 0 : Number(get(row, "reserved"));
    if (!Number.isInteger(reserved) || reserved < 0 || reserved > qty) return errors.push(`Row ${line}: reserved must be an integer between 0 and quantity.`);
    const num = (s: string) => (s === "" ? undefined : Number(s));
    const gsm = num(get(row, "gsm"));
    if (gsm !== undefined && !(gsm > 0)) return errors.push(`Row ${line}: gsm must be positive.`);
    const cost = num(get(row, "replacement_cost"));
    if (cost !== undefined && !(cost >= 0)) return errors.push(`Row ${line}: replacement_cost must be ≥ 0.`);
    const grain = (get(row, "grain") || "none").toLowerCase();
    if (!["x", "y", "none"].includes(grain)) return errors.push(`Row ${line}: grain must be x, y or none.`);
    const cond = (get(row, "condition") || "good").toLowerCase();
    if (!(CONDITIONS as readonly string[]).includes(cond)) return errors.push(`Row ${line}: unknown condition "${cond}".`);
    const defects = get(row, "defects")
      .split("|")
      .filter(Boolean)
      .map((d) => d.split(";").map(Number))
      .map(([x, y, w, h]) => ({ x, y, w, h }));
    if (defects.some((d) => ![d.x, d.y, d.w, d.h].every(Number.isFinite) || d.w <= 0 || d.h <= 0)) return errors.push(`Row ${line}: defects must be "x;y;w;h" in mm separated by "|".`);
    const color = get(row, "color") || "#9a9a8e";
    out.push({
      id: makeId(),
      name: get(row, "name") || `Imported ${line}`,
      fabricType: fabric,
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#9a9a8e",
      colorName: get(row, "color_name"),
      width,
      height,
      thicknessMm: num(get(row, "thickness_mm")),
      gsm,
      condition: cond as MaterialRemnant["condition"],
      quantity: qty,
      reserved,
      consumed: 0,
      batchId: get(row, "batch_id"),
      grain: grain as MaterialRemnant["grain"],
      allowRotation: !["no", "false", "0"].includes(get(row, "allow_rotation").toLowerCase()),
      defects,
      location: get(row, "location"),
      replacementCost: cost,
      notes: get(row, "notes"),
      source: "import",
      createdAt: at,
    });
  });
  return { remnants: out, errors };
}
