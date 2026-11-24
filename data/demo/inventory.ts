import type { MaterialRemnant } from "@/core/domain/types";

/**
 * SYNTHETIC demonstration inventory for a fictional small textile workshop.
 * Dimensions, GSM values and costs are plausible but invented. Not real-world data.
 */
const T0 = Date.UTC(2026, 0, 5);

type Seed = Omit<MaterialRemnant, "reserved" | "consumed" | "source" | "createdAt" | "notes" | "condition" | "location"> &
  Partial<Pick<MaterialRemnant, "notes" | "condition" | "location">>;

const r = (s: Seed, i: number): MaterialRemnant => ({
  condition: "good",
  location: "Rack A",
  notes: "",
  ...s,
  reserved: 0,
  consumed: 0,
  source: "demo",
  createdAt: T0 + i * 3_600_000,
});

const SEEDS: Seed[] = [
  { id: "R01", name: "Selvedge denim offcut", fabricType: "denim", color: "#2c3e5c", colorName: "Indigo", width: 1500, height: 620, gsm: 400, quantity: 2, batchId: "B-2601-DN", grain: "x", allowRotation: true, defects: [{ x: 820, y: 210, w: 120, h: 90 }], replacementCost: 9.5, location: "Rack A1", notes: "Bleach stain near centre on both pieces." },
  { id: "R02", name: "Raw canvas end-of-roll", fabricType: "canvas", color: "#d8cfb8", colorName: "Natural", width: 1200, height: 900, gsm: 340, quantity: 1, batchId: "B-2601-CV", grain: "y", allowRotation: true, defects: [{ x: 300, y: 450, w: 60, h: 60 }], replacementCost: 11, location: "Rack A2", notes: "Small hole from roll core." },
  { id: "R03", name: "Washed linen panel", fabricType: "linen", color: "#b9b19a", colorName: "Oatmeal", width: 700, height: 500, gsm: 190, quantity: 3, batchId: "B-2601-LN", grain: "y", allowRotation: true, defects: [], replacementCost: 6, location: "Rack B1" },
  { id: "R04", name: "Directional print poplin", fabricType: "cotton", color: "#c4553e", colorName: "Terracotta print", width: 1100, height: 450, gsm: 120, quantity: 2, batchId: "B-2602-CT", grain: "x", allowRotation: false, defects: [], replacementCost: 4, location: "Rack B2", notes: "One-way print — pieces must not be rotated." },
  { id: "R05", name: "Shirting offcut", fabricType: "cotton", color: "#e8e6df", colorName: "White stripe", width: 480, height: 360, gsm: 110, quantity: 6, batchId: "B-2602-SH", grain: "y", allowRotation: true, defects: [], replacementCost: 1.8, location: "Bin 3" },
  { id: "R06", name: "Wool melton remnant", fabricType: "wool", color: "#4b4f45", colorName: "Charcoal", width: 800, height: 600, gsm: 500, quantity: 1, batchId: "B-2602-WL", grain: "y", allowRotation: true, defects: [{ x: 520, y: 140, w: 40, h: 40 }], replacementCost: 14, location: "Rack C1", condition: "fair", notes: "Moth hole." },
  { id: "R07", name: "Silk lining strip", fabricType: "silk", color: "#7a2f3b", colorName: "Burgundy", width: 1400, height: 260, gsm: 70, quantity: 2, batchId: "B-2603-SK", grain: "x", allowRotation: true, defects: [], replacementCost: 7, location: "Drawer 2" },
  { id: "R08", name: "Jersey cutting-room waste", fabricType: "jersey", color: "#6d7f8f", colorName: "Heather blue", width: 600, height: 400, gsm: 180, quantity: 4, batchId: "B-2603-JR", grain: "y", allowRotation: true, defects: [], replacementCost: 1.2, location: "Bin 5" },
  { id: "R09", name: "Polyester banner offcut", fabricType: "polyester", color: "#213d35", colorName: "Forest", width: 900, height: 700, gsm: 200, quantity: 1, batchId: "B-2603-PL", grain: "x", allowRotation: true, defects: [], replacementCost: 3, location: "Rack C2" },
  { id: "R10", name: "Felt sheet", fabricType: "felt", color: "#a8432f", colorName: "Rust", width: 300, height: 300, gsm: 350, quantity: 5, batchId: "B-2604-FT", grain: "none", allowRotation: true, defects: [], replacementCost: 1.5, location: "Drawer 4" },
  { id: "R11", name: "Denim leg panel (returns)", fabricType: "denim", color: "#3d5a80", colorName: "Mid blue", width: 300, height: 900, gsm: 380, quantity: 4, batchId: "B-2604-RT", grain: "y", allowRotation: true, defects: [{ x: 60, y: 420, w: 160, h: 120 }], replacementCost: 2.5, location: "Bin 7", condition: "worn", notes: "Worn knee area excluded." },
  { id: "R12", name: "Tablecloth second", fabricType: "blend", color: "#9fae8c", colorName: "Sage", width: 1300, height: 1000, gsm: 210, quantity: 1, batchId: "B-2604-TB", grain: "y", allowRotation: true, defects: [{ x: 200, y: 150, w: 90, h: 70 }, { x: 900, y: 700, w: 150, h: 110 }], replacementCost: 8, location: "Rack D1", notes: "Two stains." },
  { id: "R13", name: "Canvas sample swatch", fabricType: "canvas", color: "#cfa349", colorName: "Mustard", width: 250, height: 250, gsm: 300, quantity: 6, batchId: "B-2605-SW", grain: "y", allowRotation: true, defects: [], replacementCost: 0.8, location: "Drawer 1" },
  { id: "R14", name: "Quilting fat quarter", fabricType: "cotton", color: "#5e7f63", colorName: "Fern print", width: 550, height: 500, gsm: 140, quantity: 3, batchId: "B-2605-FQ", grain: "y", allowRotation: true, defects: [], replacementCost: 3, location: "Drawer 3" },
];

export const DEMO_INVENTORY: MaterialRemnant[] = SEEDS.map(r);

export const DEMO_CONSTRAINTS = { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true };
