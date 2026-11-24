import type { AlgorithmId, MaxRectsHeuristic, ObjectiveMode, OptimizationConstraints, OptimizationRequest, OptimizationResult, SearchSettings } from "@/core/domain/types";
import type { LengthUnit } from "@/core/domain/units";

export interface DemandSetting {
  max: number;
  priority: boolean;
}

export interface ProjectSettings {
  demand: Record<string, DemandSetting>;
  excludedRemnants: string[];
  constraints: OptimizationConstraints;
  objective: ObjectiveMode;
  algorithm: AlgorithmId;
  heuristic: MaxRectsHeuristic;
  search: SearchSettings;
  lastRequest: OptimizationRequest | null;
  lastResult: OptimizationResult | null;
  /** Result of the most recent run before lastResult, used for change highlighting. */
  previousResult: OptimizationResult | null;
  /** Baseline run on the same inputs for comparison view. */
  baselineResult: OptimizationResult | null;
}

export interface AppPrefs {
  unit: LengthUnit;
  theme: "light" | "dark" | "system";
  currency: string;
  onboarded: boolean;
  judgeMode: boolean;
  judgeStep: number;
  reducedMotion: "system" | "reduce";
}

export const DEFAULT_PREFS: AppPrefs = {
  unit: "mm",
  theme: "light",
  currency: "€",
  onboarded: false,
  judgeMode: false,
  judgeStep: 0,
  reducedMotion: "system",
};

export const DEFAULT_SETTINGS = (): ProjectSettings => ({
  demand: {},
  excludedRemnants: [],
  constraints: { clearance: 4, edgeMargin: 5, allowRotation: true, respectGrain: true },
  objective: "material",
  algorithm: "search",
  heuristic: "bssf",
  search: { seed: 42, timeLimitMs: 4000, maxIterations: 600 },
  lastRequest: null,
  lastResult: null,
  previousResult: null,
  baselineResult: null,
});
