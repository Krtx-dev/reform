import type { ObjectiveMode } from "../domain/types";

export interface ObjectiveInputs {
  usedCutArea: number;
  eligibleUsableArea: number;
  units: number;
  value: number;
  priorityUnits: number;
  totalDemandUnits: number;
  totalDemandValue: number;
  totalPriorityUnits: number;
}

export interface ObjectiveTerms {
  /** Material utilization U = usedCutArea / eligibleUsableArea. */
  U: number;
  /** Product completion P = units / total demanded units. */
  P: number;
  /** Value completion V = value / total demanded value. */
  V: number;
  /** Priority fulfillment F = priority units / demanded priority units (= P when no priority lines). */
  F: number;
}

const safe = (n: number, d: number) => (d > 0 ? n / d : 0);

export function objectiveTerms(i: ObjectiveInputs): ObjectiveTerms {
  const P = safe(i.units, i.totalDemandUnits);
  return {
    U: safe(i.usedCutArea, i.eligibleUsableArea),
    P,
    V: safe(i.value, i.totalDemandValue),
    F: i.totalPriorityUnits > 0 ? safe(i.priorityUnits, i.totalPriorityUnits) : P,
  };
}

/** Human-readable formula for each mode. Kept next to the implementation so docs and code agree. */
export const OBJECTIVE_FORMULAS: Record<ObjectiveMode, { label: string; formula: string; description: string }> = {
  material: { label: "Maximum material recovery", formula: "U + 0.0001·P", description: "Maximise the share of usable fabric allocated to complete products. Completion breaks ties." },
  products: { label: "Maximum complete products", formula: "P + 0.001·U", description: "Maximise the number of complete products. Utilization breaks ties." },
  value: { label: "Maximum production value", formula: "V + 0.001·U", description: "Maximise the estimated value of complete products. Utilization breaks ties." },
  priority: { label: "Priority product fulfillment", formula: "0.6·F + 0.25·P + 0.15·U", description: "Fulfil products flagged as priority first, then other demand, then utilization." },
  balanced: { label: "Balanced", formula: "0.4·U + 0.3·P + 0.3·V", description: "Weighted blend of normalized utilization, completion and value." },
};

export function objectiveScore(mode: ObjectiveMode, i: ObjectiveInputs): number {
  const { U, P, V, F } = objectiveTerms(i);
  switch (mode) {
    case "material":
      return U + 0.0001 * P;
    case "products":
      return P + 0.001 * U;
    case "value":
      return V + 0.001 * U;
    case "priority":
      return 0.6 * F + 0.25 * P + 0.15 * U;
    case "balanced":
      return 0.4 * U + 0.3 * P + 0.3 * V;
  }
}
