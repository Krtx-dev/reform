# Impact methodology

## The waste problem

Textile manufacturing and repair generate pre-consumer waste that is still usable fabric: cutting-room offcuts between pattern pieces, end-of-roll lengths too short for a production marker, seconds with a localized stain or hole, sample swatches, and panels recovered from returns. Because each remnant differs in size, fibre, colour, grain and condition, deciding what it can still become is slow, manual and rarely done; the material is typically discarded or downcycled.

REFORM addresses the decision problem: given the remnants actually on hand, which complete products can be cut from them, and exactly how? It does not physically recover anything by itself; it produces plans that make recovery practical.

> REFORM does not cite industry-wide waste statistics. We did not independently verify specific figures for this submission, and the demonstration data is synthetic. Readers looking for sector context can consult published work such as the Ellen MacArthur Foundation's *A New Textiles Economy* (2017).

## What is measured

All quantities are computed by `core/impact/metrics.ts` from the actual placements; formulas are also shown in the app (Impact → Methodology).

| Metric | Formula |
|---|---|
| Total available area | Σ W×H over selected material pieces (quantity − reserved) |
| Eligible area | Σ W×H over pieces whose fabric is accepted by ≥ 1 requested product |
| Defect area | Σ area of the union of defect rectangles inside each eligible piece |
| Eligible usable area | eligible area − defect area |
| Allocated cut-pattern area | Σ cut w×h of pieces in **complete** products |
| Net finished product area | Σ finished w×h (without seam allowance) |
| Utilization | allocated cut-pattern area ÷ eligible usable area (0 if denominator is 0) |
| Remaining unallocated area | eligible usable area − allocated cut-pattern area |
| Estimated mass | Σ per piece: area (m²) × GSM of *its own* material ÷ 1000 (kg) |
| Replacement value | Σ per piece: area × (replacement cost of its material piece ÷ that piece's area) |
| Improvement vs baseline | U_search − U_shelf (points); relative = Δ ÷ U_shelf |

Design choices:

- **Denominator** is eligible usable area so that defects and fabrics no requested product accepts do not depress the score, and so that the number is honest about material that is actually cuttable for the selected products. Total area is always shown next to it.
- **Never counted as recovered:** clearance gaps, edge margins, off-cuts, pieces of products that could not be completed.
- **Seam allowance** is part of the cut area (it is fabric consumed by the product) but net finished area is reported separately.
- **Mass** is computed per material before aggregation; materials without GSM are excluded and the GSM coverage share is reported. No default GSM is assumed.
- **Value** is reported only where costs were entered, with coverage.

## Baseline methodology

The baseline is First-Fit shelf packing — rows of pieces, the way a cutter without nesting software typically lays out a remnant. Baseline and improved algorithms receive the same inventory, templates, constraints and demand limits. Their different search budgets are disclosed: the baseline makes one deterministic pass; the search evaluates up to *maxIterations* candidates within *timeLimitMs*.

## Proposed vs committed vs verified

| State | Meaning | Where |
|---|---|---|
| Available | Material in inventory, not reserved | Inventory, Impact |
| Allocated (proposed) | Material assigned to complete products in an optimization result or draft plan | Optimizer, Plans, Impact |
| Consumed (committed) | Material pieces deducted from inventory by committing a plan (exactly once) | Plans, Impact |
| Physically verified | Measured after cutting | **Not recorded by REFORM** — shown as "not recorded" |

A proposed allocation is not landfill diversion. Even a committed plan is a record of intent to cut; verification requires measuring actual output.

## Environmental conversion factors

REFORM applies **no** carbon, water or energy factors. Converting avoided fabric into emissions requires a lifecycle comparison (what the remnant would otherwise have become, what virgin material it displaces, transport, processing) that we cannot defend for arbitrary remnants. Any future support for user-supplied factors would label results as scenario estimates and expose the assumptions.

## Data assumptions

- Remnant dimensions are the certified rectangular usable region entered by the user (scanner values are labelled estimates).
- GSM and costs are user-entered; demo values are invented but plausible.
- Product templates are illustrative and not validated for production.
- All demonstration and benchmark data is synthetic.
