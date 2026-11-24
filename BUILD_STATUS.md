# BUILD_STATUS

_Last updated: 2026-11-24_

## Status: feature-complete MVP, verified

| Check | Result |
|---|---|
| Unit + property tests (`npm test`) | **155 / 155 passing** (5 files) |
| End-to-end (`npm run test:e2e`) | **2 / 2 passing** — full 12-step workflow + benchmark lab |
| Typecheck (`tsc --noEmit`, strict) | passing |
| Lint (`eslint .`) | passing, 0 warnings |
| Production build (`next build`) | passing, 15 static routes |
| Benchmarks (`npm run benchmark`) | 8 datasets, 0 invalid placements; results in `docs/BENCHMARKS.md` |
| Browser console errors during E2E | none |

## Completed

**P0** inventory · pattern library · First-Fit Shelf baseline · MaxRects (BSSF/BAF/BL/BLSF) · multi-strategy search · transactional complete-product allocation · independent validator · React Konva studio · utilization/impact metrics · benchmark lab · IndexedDB persistence · production build · automated tests.

**P1** live replanning (input hash → OUTDATED, re-run, per-product diff, lime highlights) · custom product editor · production plans with idempotent commit · SVG (true mm) / PDF / CSV / JSON export + validated JSON import · playback of real snapshots and build order · demo factory with reset · judge guide · command palette · keyboard shortcuts · light/dark · reduced motion.

**P2** scanner (2-point and 4-corner perspective calibration, Otsu auto-detect, manual tracing, draggable points, inscribed-rectangle certification with confirmation, confidence notes) · extended impact analytics · rotation/grain/matched-fabric/preferred-colour constraints.

## Decisions worth knowing

- Baseline and single-pass MaxRects use a canonical **largest-product-first** order so results don't depend on product list order (found in QA: list order changed the baseline from 58.6 % to 43.0 %; now fixed and tested).
- Scanner CV is dependency-free (no OpenCV.js) — ~200 lines in `core/vision/vision.ts`.
- Clearance/margins handled exactly via an inflated packing space (no approximate gap checks).
- Search stops at iteration budget or time limit; deterministic per seed when the iteration budget binds first.

## Known limitations / open items

- Rectangles and 0°/90° only (no polygon nesting).
- Off-cuts are not returned to inventory after commit.
- Benchmark cancellation applies between datasets (each dataset runs to completion in the worker).
- Comparison view opens at fit-to-all zoom, which is small for large inventories; zoom is shared between panes.
- Not deployed; demo video not recorded (team tasks). Repository not committed/pushed by the agent.
- `npm audit` reports advisories in the dev toolchain inherited from create-next-app; not triaged.

## Next steps (if continuing)

1. Record the demo video with `docs/DEMO_SCRIPT.md`.
2. Commit and push to a public repository; deploy to Vercel (`vercel` in `reform/`).
3. Off-cut return on commit; polygon nesting.
