# Algorithms

## 1. Problem

Given material instances *I* (axis-aligned rectangles W×H with defect rectangles, fabric type, colour, grain axis and a rotation flag) and product templates *P* (each a multiset of rectangular pattern pieces with seam allowance, grain requirement and rotation flag), choose integer unit counts `0 ≤ n_p ≤ demand_p` and a placement for every piece of every chosen unit so that all hard constraints hold and an objective is maximised.

This generalises two-dimensional multiple-bin packing with heterogeneous bins (strongly NP-hard), with additional assignment constraints (fabric compatibility, matched fabric), orientation constraints (grain, rotation) and an all-or-nothing grouping constraint (a product counts only if all its pieces are placed). REFORM uses heuristics and does **not** claim optimality.

## 2. Hard constraints

| Constraint | Where enforced | Where validated |
|---|---|---|
| Inside material, ≥ edge margin `m` | `bins.ts` (shrunk bin) | validator `containment` |
| No overlap, ≥ clearance `c` apart | inflated pieces in packing space | validator `overlap` |
| ≥ `c` from defects | inflated defects pre-split from free space | validator `defects` |
| Cut = finished + 2·SA | `prepare.cutPieces` | validator `orientation` |
| Fabric allowed / matched fabric | candidate instance groups | validator `fabric` |
| Rotation only if global ∧ piece ∧ material allow | `orientationsFor` | validator `orientation` |
| Grain alignment | `orientationsFor` | validator `orientation` |
| Instance quantity (quantity − reserved) | `expandInstances` | validator `inventory` |
| Demand limit, complete products only | `allocate` | validator `completeness` |
| Invalid / zero-area geometry rejected | `prepareProblem` | — (request refused) |

### Exact clearance via an inflated space

```
bin   = (W − 2m + c) × (H − 2m + c), origin (m, m)
piece = (w + c) × (h + c)
defect (dx,dy,dw,dh) → (dx − m, dy − m, dw + c, dh + c) clipped to the bin
```
Two inflated pieces are interior-disjoint iff the real pieces are separated by ≥ c on some axis; an inflated piece fits the bin iff the real piece is ≥ m from every edge; and an inflated piece avoids an inflated defect iff the real piece is ≥ c from the defect. No approximation is involved.

## 3. Algorithm A — First-Fit Shelf (baseline)

Conventional row-based cutting. Pieces of a unit are sorted by decreasing height and laid flat (short side vertical when rotation is allowed). For each piece, scan material instances in order; within an instance try each existing shelf (row) whose height accommodates the piece, from the shelf cursor; a defect in the way moves the cursor to the defect's right edge. Otherwise open a new shelf at the bottom of the last one. Product units are processed in a canonical order — largest product (cut area) first, all units of one product before the next — so the baseline does not depend on how the product list is sorted. This is classic First-Fit Decreasing Height.

Complexity per piece: O(|I| · shelves · defects).

## 4. Algorithm B — MaxRects

Free space of each instance is a list of maximal free rectangles (possibly overlapping). To place a piece we evaluate every (instance, free rectangle, permitted orientation) and choose the minimum score:

| Heuristic | Primary score | Tie-break |
|---|---|---|
| BSSF — Best Short Side Fit | min(leftover W, leftover H) | max leftover |
| BLSF — Best Long Side Fit | max leftover | min leftover |
| BAF — Best Area Fit | free area − piece area | short side |
| BL — Bottom-Left (origin edge) | y + h | x |

After placement every free rectangle intersecting the used rectangle is split into up to four maximal remainders (left, right, top, bottom), and rectangles contained in another are pruned (exact duplicates keep one copy). Defects are inserted as used rectangles before packing. A soft colour preference adds a lexicographic first key so preferred-colour material wins ties without ever blocking placement.

Complexity per piece: O(|I| · |F|) scoring plus O(|F|²) pruning, where |F| is the free-list size (in practice tens).

## 5. Transactional complete-product allocation

```
state ← placer.init()
for unit in sequence:
    if product(unit) exhausted or demand reached: continue
    for group in candidate instance groups(product):      # one group, or one per fabric+colour if matched
        trial ← placer.clone(state)                         # copy-on-write: O(|I|)
        if every piece of the unit places into trial:       # pieces sorted by area or long side
            state ← trial; record placements; next unit
    mark product exhausted                                  # rollback = drop trial
```
A partial product never reaches `state`. Skipping a product after its first failure is a speed heuristic (free space only shrinks, so a later identical attempt almost always fails too).

## 6. Algorithm C — Multi-strategy search

1. **Construction portfolio (64 evaluations).** Unit orderings × heuristics × piece orders:
   - orderings: demand order, priority first, round-robin, largest product first, smallest product first, value density (value / cut area), two seeded shuffles;
   - heuristics: BSSF, BAF, BL, BLSF;
   - piece orders: largest area first, longest side first.
2. **Bounded local search** from the best construction. Each step applies 1–3 random moves: swap two units, move a unit, reverse a segment, drop a unit into a pool (changes the product mix), re-insert a pooled unit, change heuristic, change piece order. Acceptance: improving or equal moves always; worse moves with probability `exp(Δ / T)`, `T = 0.01 · (1 − progress)`.
3. **Budget.** Stops at `maxIterations` or `timeLimitMs`, or on cancellation. The best solution ever evaluated is kept.
4. **Determinism.** All randomness uses mulberry32 seeded by `seed`. Results are bit-identical for a seed when the iteration budget binds before the time limit (tested).
5. **Snapshots.** Every strict improvement is recorded with its full placement list (bounded at 120, thinned evenly); every 25 iterations a progress point is recorded. The studio's playback uses only these real snapshots, plus the true placement order of the final solution ("Build order").

Each evaluation is a full greedy allocation, so search cost ≈ evaluations × MaxRects allocation cost. Measured runtimes are in `docs/BENCHMARKS.md`.

## 7. Independent validation

`validateSolution(request, placements, products)` re-derives instances, cut sizes, orientation rules and compatibility from the raw request, independently of the optimizer's internal state and helpers, and checks: geometry well-formedness and unique IDs; instance existence within available quantity; containment with margin; pairwise clearance (sweep over x); defect clearance; fabric compatibility and matched fabric; cut size incl. seam allowance, rotation permission and grain; that every placement belongs to a complete unit, every unit has exactly its required pieces, and units do not exceed demand. The engine refuses to return an invalid solution as a successful plan. Tests tamper with valid solutions to show each check fires, and validate 40 random seeded problems across all three algorithms.

## 8. Limitations

- Heuristic: no global optimum or gap is claimed. The baseline can win; benchmarks report it.
- Rectangles and 0°/90° only. Non-rectangular pattern pieces must be represented by their enclosing cut rectangle (conservative, under-reports nesting potential).
- No guillotine-cut constraint is modelled (MaxRects layouts may require non-guillotine cuts, which is normal for knife/rotary/laser cutting but not for some saw-based processes).
- Greedy-within-sequence allocation; product mix is explored only through sequence/drop moves.
- With the material objective the search may produce fewer units than the baseline if it prefers larger products — benchmark tables show product counts alongside utilization.
- Fabric stretch, shrinkage, print matching and nap direction beyond the rotation flag are not modelled.
