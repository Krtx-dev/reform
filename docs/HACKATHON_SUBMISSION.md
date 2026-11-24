# REFORM — Hackathon submission

**Track:** Waste reduction, sorting or recycling
**Tagline:** Waste is a design constraint, not an endpoint.

## What REFORM does

REFORM is a computational material-recovery tool for textile workshops, garment factories, tailors and upcyclers. You digitize the fabric remnants you already have — by hand, CSV import or a calibrated photo — and REFORM computes which complete products can be cut from them and exactly where every pattern piece goes. It respects defects, grain direction, rotation restrictions, seam allowance, cutting clearance, fabric compatibility and inventory quantities, and it only counts a product when every one of its pieces fits.

The output is a validated manufacturing plan: an interactive cutting layout, a true-scale SVG cutting template, a PDF report and a CSV cut list, plus transparent metrics for how much material was allocated to products. Committing a plan deducts the material from inventory exactly once.

## Inspiration

Conventional manufacturing starts with a product and buys material for it. Leftover material then becomes "waste" because nobody has the time to work out what else it could become. We wanted to flip the direction: start from the discarded material and let computation answer "what can we still make from this?"

## The specific waste problem and how success is measured

Pre-consumer textile waste — cutting-room offcuts, end-of-roll pieces, stained or damaged seconds and sample swatches — is usually still good fabric, but every piece is different, so matching remnants to products is a hard, manual 2D packing problem that is rarely attempted. REFORM measures success as **material utilization**: the cut-pattern area of complete products divided by the usable area (minus defects) of remnants that the requested products can use, reported alongside the number of complete products, remaining unallocated area, estimated mass (from each fabric's GSM) and improvement over a conventional shelf-cutting baseline on identical inputs. On eight deterministic synthetic benchmark datasets the multi-strategy search raised utilization by **+1.6 to +19.7 percentage points** over a conventional largest-first shelf-cutting baseline (demonstration factory: 49.5 % → 64.0 %), with zero invalid placements; a single MaxRects pass, by contrast, lost to the baseline on one dataset (see `docs/BENCHMARKS.md`). These are algorithm results on synthetic data; we distinguish proposed allocation, committed consumption and physically verified recovery, and we do not claim landfill diversion or carbon savings.

## How we built it

- **Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 4.**
- **Framework-free computational core** in `core/`: domain model, geometry, a MaxRects packer with four scoring heuristics, a First-Fit Shelf baseline, transactional complete-product allocation, a seeded multi-strategy search, an independent validator, impact metrics and exports.
- **Web Worker** execution with ~40 ms time slices, real progress, cancellation and best-valid-intermediate results.
- **React Konva** manufacturing canvas: zoom around cursor, pan, rulers, grid, five view modes (material, production, waste, comparison, technical), hover/selection inspection and playback of real solver snapshots.
- **Dexie/IndexedDB** persistence, **Zustand** state, **Zod** validation, **jsPDF** reports, **GSAP/Motion** for data-driven motion, **Sonner** notifications, **Lucide** icons.
- **Dependency-free scanner CV**: Otsu segmentation, convex hull, 4-point homography for perspective correction, largest inscribed rectangle — no AI service.
- **Tests:** Vitest unit/property tests (geometry, every algorithm, transactional rollback, tamper detection, 40 random seeded problems × 3 algorithms, impact math, commits, exports, vision) and Playwright end-to-end tests of the full workflow.

## Technical challenges

- **Exact clearance and margins.** We avoided approximate gap checks by transforming the problem into an inflated packing space where non-overlap is mathematically equivalent to the clearance constraint.
- **All-or-nothing products.** Packing pieces independently inflates numbers with half-made products. We made allocation transactional with copy-on-write packing state so rollback is cheap enough to run thousands of times per search.
- **Trust.** An optimizer that validates itself proves little, so the validator re-derives every rule from the raw request and is tested by deliberately corrupting valid solutions.
- **Responsiveness.** Search runs in a worker in time slices so cancellation, progress and the live canvas stay real-time.
- **Honest outdated state.** A request fingerprint marks any result computed for different inputs as outdated immediately, so a stale layout is never presented as valid.

## Accomplishments

- A real, independently validated multi-product 2D packing engine running in the browser.
- Live replanning: change inventory and the plan is flagged, recomputed and diffed per product.
- Reproducible benchmark laboratory that reports baseline wins honestly.
- True-scale SVG cutting templates and PDF manufacturing reports.
- No backend, no API keys, no account; data never leaves the browser.

## What's next

- Irregular (polygon) nesting with no-fit polygons for non-rectangular pattern pieces.
- Off-cut return: re-inventory the largest leftover rectangles after a commit.
- Optional verified-recovery logging (weighed output) to move from proposed to measured impact.
- Guillotine-cut mode for saw-based cutting, and cutting-path ordering.
- Multi-user sync and integration with cutting-table/CNC formats (DXF).
- User-supplied, clearly labelled lifecycle factors for scenario analysis.

## Links

- Source: this repository (MIT).
- Demo video: _to be recorded by the team using `docs/DEMO_SCRIPT.md`._
- Deployment: Vercel-ready; not deployed by the build agent.
