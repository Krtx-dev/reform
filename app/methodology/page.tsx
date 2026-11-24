import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { OBJECTIVE_FORMULAS } from "@/core/optimization/objective";
import { LogoMark } from "@/components/workspace/Logo";

export const metadata: Metadata = { title: "Methodology — REFORM" };

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 mb-3 text-[22px] font-semibold tracking-[-0.02em] scroll-mt-20">{children}</h2>;
}
function F({ children }: { children: React.ReactNode }) {
  return <pre className="my-3 overflow-x-auto border border-line bg-surface px-4 py-3 font-mono text-[12.5px] rounded-[3px]">{children}</pre>;
}

export default function Methodology() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-[0.18em] text-[13px]"><LogoMark /> REFORM</Link>
          <Link href="/workspace" className="inline-flex items-center gap-1 text-[13px] text-primary"><ArrowLeft size={14} /> Workspace</Link>
        </div>
      </header>
      <article className="mx-auto max-w-[900px] px-5 py-12 text-[15px] leading-relaxed text-ink/90">
        <span className="label-caps">Technical & environmental methodology</span>
        <h1 className="mt-3 text-[38px] font-semibold tracking-[-0.03em] leading-tight">How REFORM computes and measures recovery</h1>
        <p className="mt-4 text-muted">Everything below is implemented in <code className="font-mono text-[13px]">core/</code> as plain TypeScript with no UI or browser dependency, and covered by automated tests.</p>

        <nav className="mt-6 grid grid-cols-2 gap-1 text-[13.5px] text-primary">
          {[["problem", "Problem formulation"], ["constraints", "Hard constraints"], ["algorithms", "Algorithms"], ["transaction", "Transactional allocation"], ["objectives", "Objectives"], ["metrics", "Metrics & formulas"], ["validation", "Independent validation"], ["claims", "Claims & limitations"]].map(([id, t]) => <a key={id} href={`#${id}`} className="hover:underline">{t}</a>)}
        </nav>

        <H id="problem">Problem formulation</H>
        <p>Given finite material instances (each remnant with quantity <em>q</em> expands into <em>q</em> identical rectangles, minus reserved pieces) and product templates made of rectangular pattern pieces, choose how many units of each product to make (bounded by demand) and place every piece of every chosen unit so that all hard constraints hold, maximizing a selected objective. This is a constrained multi-bin, multi-product two-dimensional packing problem — NP-hard in general.</p>
        <p className="mt-3">All dimensions are integer millimetres. A remnant's width × height is the <strong>certified rectangular usable region</strong>; scanner outlines are stored for reference but never inflate it.</p>

        <H id="constraints">Hard constraints</H>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Pieces lie inside their material, at least the edge margin <em>m</em> from every edge.</li>
          <li>Pieces do not overlap and are at least the cutting clearance <em>c</em> apart.</li>
          <li>Pieces are at least <em>c</em> away from every defect zone.</li>
          <li>Cut size = finished size + 2 × seam allowance on each axis.</li>
          <li>Fabric type must be in the product's allowed list; matched-fabric products use one fabric type and colour.</li>
          <li>Rotation (0°/90°) only when the global switch, the piece and the material all allow it.</li>
          <li>With grain enforcement, a piece's grain axis (after rotation) equals the material's grain axis, unless either is "none".</li>
          <li>Instance quantities and demand limits are respected; only complete products are counted.</li>
        </ul>
        <p className="mt-3">Clearance and margin are handled exactly by an inflated packing space:</p>
        <F>{`bin   = (W − 2m + c) × (H − 2m + c), origin offset (m, m)
piece = (w + c) × (h + c)
defect (dx, dy, dw, dh) → (dx − m, dy − m, dw + c, dh + c)
Non-overlap in packing space ⇔ real gaps ≥ c and margins ≥ m.`}</F>

        <H id="algorithms">Algorithms</H>
        <p><strong>A · First-Fit Shelf (baseline).</strong> Products are processed largest first (by cut area) and their pieces by decreasing height, laid flat. Each goes into the first row (shelf) of the first material piece where it fits, otherwise a new row opens below. Defects push the cursor to their right edge. This mirrors the conventional row-by-row cut.</p>
        <p className="mt-3"><strong>B · MaxRects.</strong> Free space is a list of maximal free rectangles. A piece is scored against every free rectangle of every compatible material piece in every permitted orientation (Best Short Side Fit, Best Area Fit, Bottom-Left or Best Long Side Fit), placed at the best one, then every intersecting free rectangle is split into up to four maximal remainders and contained rectangles are pruned. Defects are pre-split from the initial free list.</p>
        <p className="mt-3"><strong>C · Multi-strategy search.</strong> 8 product-unit orderings (demand order, priority first, round-robin, largest/smallest product first, value density, two seeded shuffles) × 4 heuristics × 2 piece orderings = 64 constructive candidates, then bounded local search: swap, move, reverse segment, drop/re-add a unit (changes product mix), switch heuristic or piece order, with a cooling acceptance rule. The best valid solution is kept. Randomness comes from a seeded mulberry32 generator, so a seed reproduces the run when the iteration budget is reached before the time limit.</p>

        <H id="transaction">Transactional complete-product allocation</H>
        <F>{`for unit in sequence:
  trial = clone(state)            // copy-on-write
  for piece in unit.pieces:
    if not place(trial, piece): discard trial; mark product exhausted; next unit
  state = trial                   // commit all pieces atomically`}</F>

        <H id="objectives">Objectives</H>
        <p>U = utilization, P = completed units ÷ demanded units, V = value of completed units ÷ value of demanded units, F = priority units completed ÷ priority units demanded (F = P when nothing is flagged).</p>
        <table className="mt-3 w-full text-[13.5px] border border-line">
          <tbody>{Object.values(OBJECTIVE_FORMULAS).map((o) => <tr key={o.label} className="border-b border-line"><td className="p-2">{o.label}</td><td className="p-2 font-mono text-[12.5px]">{o.formula}</td></tr>)}</tbody>
        </table>
        <p className="mt-3 text-muted">The score only ranks candidate plans. Physical metrics are always reported separately.</p>

        <H id="metrics">Metrics & formulas</H>
        <F>{`total area            = Σ W×H over selected material pieces
eligible area         = Σ W×H over pieces accepted by ≥ 1 requested product
defect area           = Σ |∪ defects ∩ piece|   (exact rectangle union)
eligible usable area  = eligible area − defect area
allocated cut area    = Σ cut w×h of pieces in COMPLETE products
net product area      = Σ finished w×h (no seam allowance)
utilization           = allocated cut area ÷ eligible usable area   (0 if denominator 0)
unallocated area      = eligible usable area − allocated cut area
mass (kg)             = Σ_piece  area_m² × GSM_of_its_material ÷ 1000
replacement value     = Σ_piece  area × (cost of material piece ÷ its area)
Δ vs baseline         = U_search − U_shelf  (points);  relative = Δ ÷ U_shelf`}</F>
        <p>Mass and value are computed only where GSM or cost is known, and their coverage is shown. No default GSM is ever assumed.</p>

        <H id="validation">Independent validation</H>
        <p>A separate validator re-derives everything from the raw request — not from the optimizer's internal state — and checks geometry well-formedness, inventory availability, containment and margins, pairwise clearance, defect clearance, fabric compatibility, matched fabric, cut sizes including seam allowance, rotation and grain, product completeness and demand limits. A result failing any check is rejected rather than returned. 40 seeded random problems × 3 algorithms are validated in the automated test suite.</p>

        <H id="claims">Claims & limitations</H>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Available</strong> material, material <strong>allocated</strong> in a proposed plan, material <strong>consumed</strong> by a committed plan and material <strong>physically verified</strong> are distinct. REFORM records the first three; it has no verification data.</li>
          <li>Allocation is not landfill diversion; no carbon, water or emissions figures are computed.</li>
          <li>The demonstration factory and benchmark datasets are synthetic.</li>
          <li>Rectangular pieces only; irregular patterns must be entered as enclosing rectangles (conservative).</li>
          <li>Heuristic: no global optimality or optimality gap is claimed.</li>
          <li>Scanner dimensions are estimates that depend on calibration; only a user-confirmed inscribed rectangle is used.</li>
        </ul>
      </article>
    </div>
  );
}
