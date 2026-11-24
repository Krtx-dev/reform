import { z } from "zod";
import { CONDITIONS, FABRIC_TYPES } from "./types";

const intMm = (label: string, max = 100_000) =>
  z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number of mm`).positive(`${label} must be greater than 0`).max(max, `${label} must be at most ${max} mm`);

export const rectSchema = z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0), w: z.number().finite().positive(), h: z.number().finite().positive() });

export const remnantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "Name is required").max(120),
    fabricType: z.enum(FABRIC_TYPES),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #3b5b7a"),
    colorName: z.string().max(60),
    width: intMm("Width"),
    height: intMm("Height"),
    thicknessMm: z.number().positive().max(100).optional(),
    gsm: z.number().positive("GSM must be positive").max(2000).optional(),
    condition: z.enum(CONDITIONS),
    quantity: z.number().int("Quantity must be a whole number").min(0).max(1000),
    reserved: z.number().int().min(0),
    consumed: z.number().int().min(0),
    batchId: z.string().max(60),
    grain: z.enum(["x", "y", "none"]),
    allowRotation: z.boolean(),
    defects: z.array(rectSchema).max(50),
    location: z.string().max(80),
    replacementCost: z.number().min(0).max(1_000_000).optional(),
    notes: z.string().max(2000),
    photo: z.string().optional(),
    contour: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    source: z.enum(["manual", "scanner", "import", "demo", "offcut"]),
    createdAt: z.number(),
  })
  .superRefine((r, ctx) => {
    if (r.reserved > r.quantity) ctx.addIssue({ code: "custom", path: ["reserved"], message: "Reserved cannot exceed quantity" });
    r.defects.forEach((d, i) => {
      if (d.x + d.w > r.width || d.y + d.h > r.height) ctx.addIssue({ code: "custom", path: ["defects", i], message: `Defect ${i + 1} extends outside the material` });
    });
  });

export const pieceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Piece name is required").max(80),
  width: intMm("Piece width", 10_000),
  height: intMm("Piece height", 10_000),
  quantity: z.number().int().min(1, "Each piece needs quantity ≥ 1").max(100),
  grain: z.enum(["x", "y", "none"]),
  allowRotation: z.boolean(),
  approximated: z.boolean().optional(),
});

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Product name is required").max(120),
  description: z.string().max(1000),
  category: z.string().max(60),
  pieces: z.array(pieceSchema).min(1, "A product needs at least one pattern piece").max(40),
  seamAllowance: z.number().int().min(0).max(200),
  allowedFabrics: z.array(z.enum(FABRIC_TYPES)).min(1, "Select at least one compatible fabric"),
  matchFabric: z.boolean(),
  preferredColors: z.array(z.string()),
  value: z.number().min(0).max(100_000),
  assemblyNotes: z.string().max(4000),
  builtin: z.boolean(),
  createdAt: z.number(),
});

export const PROJECT_FORMAT = "reform.project";
export const PROJECT_VERSION = 1;

export const projectFileSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(PROJECT_VERSION),
  exportedAt: z.number(),
  project: z.object({ id: z.string(), name: z.string().min(1).max(120) }),
  remnants: z.array(remnantSchema),
  products: z.array(productSchema),
  // plans are validated structurally; their embedded results were produced and validated by the engine
  plans: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.number(), status: z.enum(["draft", "committed"]), request: z.any(), result: z.any(), notes: z.string() }).passthrough()),
});

export type ProjectFile = z.infer<typeof projectFileSchema>;

export function formatZodError(e: z.ZodError): string {
  return e.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}
