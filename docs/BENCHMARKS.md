# REFORM benchmark report

Generated 2026-11-24T13:08:36.511Z · Node v24.15.0 · darwin arm64 · Apple M4
Objective: material · seed 42 · search budget ≤ 400 iterations / 60000 ms

All algorithms received identical inventory, product templates, constraints and demand limits. Every layout was re-checked by the independent validator ("invalid" column). Datasets are synthetic and deterministic.

| Dataset | Algorithm | Utilization | Products | Allocated m² | Unallocated m² | Value | Runtime ms | Invalid |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Demonstration factory | Baseline · First-Fit Shelf | 49.46 % | 47 | 6.291 | 6.427 | 320 | 7 | 0 |
| Demonstration factory | MaxRects | 60.36 % | 51 | 7.677 | 5.042 | 398 | 3 | 0 |
| Demonstration factory | Multi-strategy search | 64.02 % | 54 | 8.142 | 4.576 | 416 | 297 | 0 |
| Small tailoring shop | Baseline · First-Fit Shelf | 58.79 % | 41 | 2.448 | 1.716 | 182 | 1 | 0 |
| Small tailoring shop | MaxRects | 63.32 % | 42 | 2.636 | 1.527 | 191 | 1 | 0 |
| Small tailoring shop | Multi-strategy search | 66.55 % | 43 | 2.771 | 1.393 | 199 | 146 | 0 |
| Mixed remnant inventory | Baseline · First-Fit Shelf | 50.55 % | 70 | 7.242 | 7.084 | 394 | 1 | 0 |
| Mixed remnant inventory | MaxRects | 52.10 % | 68 | 7.464 | 6.862 | 412 | 1 | 0 |
| Mixed remnant inventory | Multi-strategy search | 65.99 % | 79 | 9.454 | 4.873 | 503 | 339 | 0 |
| Uniform fabric batch | Baseline · First-Fit Shelf | 66.81 % | 54 | 5.345 | 2.655 | 382 | 0 | 0 |
| Uniform fabric batch | MaxRects | 86.54 % | 60 | 6.923 | 1.077 | 470 | 1 | 0 |
| Uniform fabric batch | Multi-strategy search | 86.54 % | 60 | 6.923 | 1.077 | 470 | 177 | 0 |
| Fragmented textile inventory | Baseline · First-Fit Shelf | 55.74 % | 47 | 1.977 | 1.570 | 169 | 1 | 0 |
| Fragmented textile inventory | MaxRects | 57.15 % | 49 | 2.027 | 1.520 | 175 | 1 | 0 |
| Fragmented textile inventory | Multi-strategy search | 58.53 % | 54 | 2.076 | 1.471 | 178 | 253 | 0 |
| Defect-heavy fabric batch | Baseline · First-Fit Shelf | 56.90 % | 59 | 7.502 | 5.684 | 442 | 1 | 0 |
| Defect-heavy fabric batch | MaxRects | 63.91 % | 62 | 8.427 | 4.759 | 484 | 1 | 0 |
| Defect-heavy fabric batch | Multi-strategy search | 66.87 % | 63 | 8.818 | 4.368 | 516 | 271 | 0 |
| Rotation-restricted batch | Baseline · First-Fit Shelf | 66.37 % | 59 | 6.352 | 3.219 | 345 | 1 | 0 |
| Rotation-restricted batch | MaxRects | 64.40 % | 58 | 6.164 | 3.407 | 336 | 1 | 0 |
| Rotation-restricted batch | Multi-strategy search | 67.99 % | 60 | 6.507 | 3.064 | 351 | 228 | 0 |
| High-volume manufacturing batch | Baseline · First-Fit Shelf | 64.65 % | 318 | 43.838 | 23.965 | 2374 | 6 | 0 |
| High-volume manufacturing batch | MaxRects | 67.63 % | 333 | 45.854 | 21.949 | 2494 | 10 | 0 |
| High-volume manufacturing batch | Multi-strategy search | 69.39 % | 340 | 47.052 | 20.752 | 2566 | 3609 | 0 |

## Improvement of multi-strategy search over the First-Fit Shelf baseline

| Dataset | Baseline | Search | Δ points | Relative |
|---|---:|---:|---:|---:|
| Demonstration factory | 49.46 % | 64.02 % | +14.55 | +29.4 % |
| Small tailoring shop | 58.79 % | 66.55 % | +7.76 | +13.2 % |
| Mixed remnant inventory | 50.55 % | 65.99 % | +15.44 | +30.5 % |
| Uniform fabric batch | 66.81 % | 86.54 % | +19.73 | +29.5 % |
| Fragmented textile inventory | 55.74 % | 58.53 % | +2.79 | +5.0 % |
| Defect-heavy fabric batch | 56.90 % | 66.87 % | +9.98 | +17.5 % |
| Rotation-restricted batch | 66.37 % | 67.99 % | +1.62 | +2.4 % |
| High-volume manufacturing batch | 64.65 % | 69.39 % | +4.74 | +7.3 % |

Note: the objective was material recovery, so the search may trade product count for utilization. Runtime depends on the machine; the search stops at the time limit if it is reached before the iteration budget, which makes results machine-dependent in that case.

## Reproducible inputs

Datasets are generated deterministically in `data/benchmarks/datasets.ts` from fixed seeds (101–707); the demonstration factory is `data/demo/inventory.ts`. All use the eight built-in product templates in `data/demo/products.ts`.

| Dataset | id | Lines | Pieces | Area m² | Demand (max units) | Clearance/margin mm |
|---|---|---:|---:|---:|---|---|
| Demonstration factory | `demo-factory` | 14 | 41 | 12.84 | tote×4, cushion×3, mat×4, pouch×6, pencil×6, giftbag×6, cloth×8, coaster×20 | 4/5 |
| Small tailoring shop | `small-shop` | 12 | 18 | 4.16 | pouch×8, pencil×8, coaster×30, mat×6, cushion×3 | 4/5 |
| Mixed remnant inventory | `mixed` | 20 | 32 | 14.36 | tote×6, pouch×10, cushion×4, coaster×40, pencil×10, mat×6, giftbag×10, cloth×12 | 4/5 |
| Uniform fabric batch | `uniform` | 1 | 10 | 8.00 | tote×12, coaster×60, pencil×20, mat×10 | 4/5 |
| Fragmented textile inventory | `fragmented` | 40 | 40 | 3.55 | coaster×80, pencil×20, pouch×12, cloth×20 | 3/3 |
| Defect-heavy fabric batch | `defect-heavy` | 15 | 15 | 13.53 | tote×6, cushion×6, mat×10, pouch×12, coaster×40 | 5/5 |
| Rotation-restricted batch | `rotation-restricted` | 16 | 21 | 9.57 | pouch×10, mat×8, cushion×4, coaster×40, giftbag×8 | 4/5 |
| High-volume manufacturing batch | `high-volume` | 30 | 94 | 68.04 | tote×30, pouch×40, cushion×15, coaster×150, pencil×40, mat×30, giftbag×30, cloth×40 | 4/5 |

## How to reproduce

```bash
npm run benchmark        # rewrites this file
```

Or in the app: Workspace → Benchmark → Run benchmark (uses a 3 s default time limit; raise it to match this file exactly).

This file was generated by `scripts/benchmark.ts` with settings: objective=material, seed=42, maxIterations=400, timeLimitMs=60000 (iteration budget binds first, so results are deterministic for the seed; runtimes vary by machine).
