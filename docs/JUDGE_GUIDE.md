# Judge guide

## Launch

```bash
cd reform
npm install
npm run build && npm start      # http://localhost:3000
# or: npm run dev
```
Requires Node 20+ (tested on Node 24). No environment variables, API keys or accounts.

## Demo dataset

Open `/workspace` and choose **Explore the demonstration factory**. A guided walkthrough (Judge guide, top bar) opens; it can be toggled any time. **Reset demo** in the top bar restores the original synthetic data. All demo data is synthetic (`data/demo/`).

## Reproduce the main benchmark

- In the app: **Benchmark → Run benchmark**. Every number is computed in your browser when you press the button.
- From the command line: `npm run benchmark` (rewrites `docs/BENCHMARKS.md`; deterministic for the seed because the iteration budget binds first).

## Inspect the algorithm

- Code: `core/optimization/` — `placers.ts` (MaxRects, Shelf), `allocate.ts` (transactional allocation), `engine.ts` (search), `validation/validator.ts` (independent validator). Explanation: `docs/ALGORITHMS.md`.
- In the studio: **Constraints** tab chooses algorithm/heuristic/seed/budget; the **Inspector** shows the winning strategy, score, iterations, runtime, input hash and each validation check; the **timeline** replays real solver snapshots; **Technical** view (5) shows cut dimensions, clearance outlines, rotation markers and grain arrows.
- Standalone: the engine has no UI dependency —
  ```ts
  import { optimize } from "./core/optimization/engine";
  const r = optimize(request); // see tests/unit/helpers.ts for building a request
  ```

## Verify environmental calculations

- **Impact** page → any ⓘ opens the formula drawer; `/methodology` has the full derivation.
- Hand-calculated fixtures: `tests/unit/impact.test.ts` (e.g. 4 × 400 mm squares on a 1 m² sheet with a 100 mm defect → 640 000 / 990 000 utilization; 0.64 m² × 200 gsm = 0.128 kg).
- Select a material in the canvas (click it) to see its per-piece utilization and defect area.

## Test alternative inputs

- Add a remnant (Inventory → Add material) or import CSV (template downloadable from the import dialog).
- Create a product (Products → Create product) and set its quantity in Optimizer → Products.
- Untick materials, change clearance, disable rotation or grain, change objective — the result is marked **OUTDATED** until you re-run.
- Try the scanner with any photo of fabric next to an A4 sheet: 4-corner calibration, auto-detect or manual outline, then certify an inscribed rectangle.
- Run the test suites: `npm test` (unit/property) and `npm run test:e2e` (browser).
