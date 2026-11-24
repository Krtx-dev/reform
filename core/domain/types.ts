/**
 * REFORM domain model.
 *
 * All linear dimensions are stored as integer millimetres (mm).
 * All areas are square millimetres (mm²) unless a name says otherwise.
 * Coordinates: origin at the remnant's top-left corner, x to the right, y downward.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FABRIC_TYPES = [
  "cotton",
  "linen",
  "denim",
  "canvas",
  "wool",
  "felt",
  "polyester",
  "silk",
  "jersey",
  "blend",
] as const;
export type FabricType = (typeof FABRIC_TYPES)[number];

/** Direction of the lengthwise (warp) grain. "none" = non-woven / unknown, no constraint. */
export type GrainAxis = "x" | "y" | "none";

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export type MaterialSource = "manual" | "scanner" | "import" | "demo" | "offcut";

export interface Point {
  x: number;
  y: number;
}

export interface MaterialRemnant {
  id: string;
  name: string;
  fabricType: FabricType;
  /** Hex colour used for display, e.g. "#3b5b7a". */
  color: string;
  colorName: string;
  /** Certified rectangular usable region, integer mm. */
  width: number;
  height: number;
  thicknessMm?: number;
  gsm?: number;
  condition: Condition;
  /** Identical pieces on hand (including reserved). */
  quantity: number;
  /** Pieces set aside; excluded from optimization. */
  reserved: number;
  /** Pieces consumed by committed production plans (history counter). */
  consumed: number;
  batchId: string;
  grain: GrainAxis;
  /** Whether pattern pieces may be rotated 90° on this material (e.g. false for directional prints / nap). */
  allowRotation: boolean;
  /** Defect exclusion zones in remnant coordinates (mm). */
  defects: Rect[];
  location: string;
  /** Estimated replacement cost for ONE piece, in the user's currency. */
  replacementCost?: number;
  notes: string;
  /** Optional photograph as a data URL (scanner). */
  photo?: string;
  /** Optional traced outline (mm, estimate) from the scanner. Not used by the rectangular optimizer. */
  contour?: Point[];
  source: MaterialSource;
  createdAt: number;
}

export interface PatternPiece {
  id: string;
  name: string;
  /** Finished (sewn) dimensions in mm, excluding seam allowance. */
  width: number;
  height: number;
  /** Copies of this piece required per product. */
  quantity: number;
  /** Required grain direction relative to the piece's own axes. */
  grain: GrainAxis;
  allowRotation: boolean;
  /** True when the real piece is not rectangular and is represented by an enclosing cut rectangle. */
  approximated?: boolean;
}

export interface ProductTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  pieces: PatternPiece[];
  /** Seam allowance in mm added to every side of every piece. */
  seamAllowance: number;
  allowedFabrics: FabricType[];
  /** When true, all pieces of one product must come from the same fabric type and colour. */
  matchFabric: boolean;
  /** Preferred colours (hex). Soft preference: preferred material is used first when it fits. */
  preferredColors: string[];
  /** Estimated value of one finished unit, user currency. Illustrative. */
  value: number;
  assemblyNotes: string;
  builtin: boolean;
  createdAt: number;
}

export type ObjectiveMode = "material" | "products" | "value" | "priority" | "balanced";
export type AlgorithmId = "shelf" | "maxrects" | "search";
export type MaxRectsHeuristic = "bssf" | "baf" | "bl" | "blsf";

export interface DemandLine {
  productId: string;
  /** Maximum units to manufacture. */
  max: number;
  priority: boolean;
}

export interface OptimizationConstraints {
  /** Cutting clearance between pieces and around defects, mm. */
  clearance: number;
  /** Margin kept free along every remnant edge, mm. */
  edgeMargin: number;
  /** Global switch: allow 90° rotation where material and piece allow it. */
  allowRotation: boolean;
  /** Enforce grain alignment between piece and material. */
  respectGrain: boolean;
}

export interface SearchSettings {
  seed: number;
  timeLimitMs: number;
  maxIterations: number;
}

export interface OptimizationRequest {
  remnants: MaterialRemnant[];
  products: ProductTemplate[];
  demand: DemandLine[];
  constraints: OptimizationConstraints;
  objective: ObjectiveMode;
  algorithm: AlgorithmId;
  heuristic?: MaxRectsHeuristic;
  search: SearchSettings;
}

/** One physical piece of material (a remnant with quantity 3 expands into 3 instances). */
export interface MaterialInstance {
  id: string;
  remnantId: string;
  index: number;
  name: string;
  width: number;
  height: number;
  fabricType: FabricType;
  color: string;
  grain: GrainAxis;
  allowRotation: boolean;
  defects: Rect[];
  gsm?: number;
  /** Replacement cost per mm², if known. */
  costPerMm2?: number;
}

export interface Placement {
  id: string;
  instanceId: string;
  remnantId: string;
  productId: string;
  unitId: string;
  pieceId: string;
  pieceName: string;
  copyIndex: number;
  /** Position of the cut rectangle in remnant coordinates (mm). */
  x: number;
  y: number;
  /** Placed (possibly rotated) cut dimensions (mm). */
  w: number;
  h: number;
  rotated: boolean;
  /** Finished (net) area of the piece, mm², excluding seam allowance. */
  netArea: number;
  /** Order in which the solver placed this piece. */
  seq: number;
}

export interface CompletedProduct {
  unitId: string;
  productId: string;
  productName: string;
  placementIds: string[];
}

export interface FabricBreakdown {
  fabricType: FabricType;
  availableArea: number;
  usableArea: number;
  usedArea: number;
  massKg: number | null;
}

export interface ProductBreakdown {
  productId: string;
  productName: string;
  units: number;
  demanded: number;
  cutArea: number;
  value: number;
}

export interface ImpactMetrics {
  /** Area of all selected material instances (gross). */
  totalArea: number;
  /** Gross area of instances compatible with at least one demanded product. */
  eligibleArea: number;
  /** Defect area (union) inside eligible instances. */
  defectArea: number;
  /** eligibleArea − defectArea. Utilization denominator. */
  eligibleUsableArea: number;
  /** Area of cut rectangles (incl. seam allowance) of complete products. */
  usedCutArea: number;
  /** Finished area of complete products (excl. seam allowance). */
  netProductArea: number;
  /** eligibleUsableArea − usedCutArea. */
  unallocatedArea: number;
  /** usedCutArea / eligibleUsableArea, in [0,1]. 0 when denominator is 0. */
  utilization: number;
  productsCompleted: number;
  productionValue: number;
  /** Estimated mass of cut material allocated, kg. Null when no allocated material has GSM. */
  allocatedMassKg: number | null;
  /** Fraction of allocated cut area whose GSM is known. */
  massCoverage: number;
  /** Estimated mass of eligible usable material, kg (known-GSM portion only). */
  eligibleMassKg: number | null;
  /** Equivalent replacement value of allocated material. Null when no cost data. */
  replacementValue: number | null;
  costCoverage: number;
  instancesUsed: number;
  byFabric: FabricBreakdown[];
  byProduct: ProductBreakdown[];
}

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ValidationReport {
  valid: boolean;
  checks: ValidationCheck[];
  violations: string[];
}

export interface IterationSnapshot {
  iteration: number;
  elapsedMs: number;
  score: number;
  utilization: number;
  products: number;
  /** "improvement" snapshots carry the full best-so-far layout. */
  kind: "improvement" | "progress";
  label: string;
  placements?: Placement[];
}

export interface OptimizationResult {
  ok: boolean;
  error?: string;
  algorithm: AlgorithmId;
  strategy: string;
  objective: ObjectiveMode;
  seed: number;
  instances: MaterialInstance[];
  placements: Placement[];
  products: CompletedProduct[];
  productCounts: Record<string, number>;
  metrics: ImpactMetrics;
  score: number;
  validation: ValidationReport;
  runtimeMs: number;
  iterations: number;
  evaluations: number;
  history: IterationSnapshot[];
  inputHash: string;
  cancelled: boolean;
  createdAt: number;
}

export interface BenchmarkRow {
  algorithm: AlgorithmId;
  label: string;
  utilization: number;
  products: number;
  usedCutArea: number;
  unallocatedArea: number;
  value: number;
  runtimeMs: number;
  invalidPlacements: number;
  evaluations: number;
  budget: string;
}

export interface BenchmarkResult {
  datasetId: string;
  datasetName: string;
  rows: BenchmarkRow[];
  /** Improved (search) utilization − baseline utilization, percentage points. */
  improvementPts: number;
  /** Relative improvement in utilization, %. Null when baseline is 0. */
  relativeImprovementPct: number | null;
  results: Record<AlgorithmId, OptimizationResult>;
}

export type PlanStatus = "draft" | "committed";

export interface ProductionPlan {
  id: string;
  name: string;
  createdAt: number;
  status: PlanStatus;
  committedAt?: number;
  request: OptimizationRequest;
  result: OptimizationResult;
  notes: string;
}
