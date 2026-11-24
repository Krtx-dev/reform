export interface JudgeStep {
  title: string;
  href: string;
  body: string;
}

export const JUDGE_STEPS: JudgeStep[] = [
  { title: "Start from waste", href: "/workspace/inventory", body: "The demonstration factory holds 14 synthetic remnant lines (41 physical pieces). Note the defect zones (red hatching), the directional print that forbids rotation (R04) and the fabric types." },
  { title: "Choose what to make", href: "/workspace/optimizer", body: "In the left panel, set product quantities and pick an objective. Tote bags are flagged as priority. Each product only counts when every one of its pattern pieces is placed." },
  { title: "Run the real optimizer", href: "/workspace/optimizer", body: "Press Run (or R). The multi-strategy search runs in a Web Worker; the progress bar and canvas update from real iterations. Every result is re-checked by an independent validator." },
  { title: "Replay the search", href: "/workspace/optimizer", body: "Use the timeline under the canvas to scrub through real best-so-far snapshots, or switch to Build order to watch pieces placed in solver order. Try Technical view (5) for dimensions and grain." },
  { title: "Compare with the baseline", href: "/workspace/optimizer", body: "Click Compare baseline. A conventional First-Fit Shelf layout runs on identical inputs; Comparison view shows both side by side with the measured difference." },
  { title: "Replan live", href: "/workspace/optimizer", body: "Untick a large remnant (e.g. R12 Tablecloth second) in Materials. The result is marked OUTDATED immediately. Re-run to see which products were gained or lost." },
  { title: "Save, export, commit", href: "/workspace/plans", body: "Save the plan, then export the SVG cutting layout (true mm scale), PDF report, CSV cut list or JSON. Committing deducts material once — a second commit is refused." },
  { title: "Verify the algorithms", href: "/workspace/benchmark", body: "Run all eight deterministic datasets. Results are computed live; if the baseline wins on a dataset it is reported as such. Download the report." },
  { title: "Check the numbers", href: "/workspace/impact", body: "Every metric opens its formula in the methodology drawer. Proposed, committed and verified material are kept separate; no carbon factors are assumed." },
];
