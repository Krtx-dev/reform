import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HeroDiagram } from "@/components/landing/HeroDiagram";
import { LiveDemoStats } from "@/components/landing/LiveDemoStats";
import { LogoMark } from "@/components/workspace/Logo";

const STAGES = [
  ["01", "Digitize", "Record each remnant as a certified usable rectangle with defects, grain, rotation rules, GSM and cost — by hand, CSV or photo scanner."],
  ["02", "Match", "Pattern templates declare pieces, seam allowance and compatible fabrics. Only complete products count."],
  ["03", "Optimize", "Shelf baseline, MaxRects and a seeded multi-strategy search allocate pieces under every hard constraint, in a Web Worker."],
  ["04", "Measure", "An independent validator re-checks every layout. Utilization, mass and value are reported with their formulas."],
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-5">
          <span className="flex items-center gap-2 font-semibold tracking-[0.18em] text-[13px]"><LogoMark /> REFORM</span>
          <nav className="flex items-center gap-5 text-[13px]">
            <Link href="/methodology" className="hidden sm:inline text-muted hover:text-ink">Methodology</Link>
            <Link href="/workspace/benchmark" className="hidden sm:inline text-muted hover:text-ink">Benchmarks</Link>
            <Link href="/workspace" className="inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-primary px-3 text-primary-ink font-medium">Launch workspace <ArrowRight size={14} /></Link>
          </nav>
        </div>
      </header>

      <section className="tech-grid-lg border-b border-line">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
          <div className="flex flex-col justify-center">
            <span className="label-caps text-primary">Computational material recovery</span>
            <h1 className="mt-4 text-[42px] leading-[1.03] font-semibold tracking-[-0.035em] md:text-[58px]">Waste is a design constraint, not an endpoint.</h1>
            <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-muted">REFORM transforms discarded textile remnants into optimized manufacturing plans, recovering usable material before it becomes waste.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/workspace" className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-primary px-5 text-[14px] font-medium text-primary-ink hover:brightness-110">Launch workspace <ArrowRight size={16} /></Link>
              <Link href="/workspace/optimizer?run=1" className="inline-flex h-11 items-center gap-2 rounded-[3px] border border-ink px-5 text-[14px] font-medium hover:bg-ink hover:text-bg">Explore live demonstration</Link>
            </div>
            <p className="mt-4 text-[12px] text-muted">Runs entirely in your browser · no account · no API keys · open source</p>
          </div>
          <div className="border border-line-strong bg-surface p-4 rounded-[3px]">
            <HeroDiagram />
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-[1280px] px-5 py-16">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <span className="label-caps">The problem</span>
              <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.02em] leading-tight">Cutting rooms throw away fabric that is still good enough to make something.</h2>
            </div>
            <div className="text-[15px] leading-relaxed text-muted flex flex-col gap-4">
              <p>Garment factories, tailors and upcyclers accumulate end-of-roll pieces, cutting-room offcuts, seconds with a stain and returns. Each piece is irregular in size, fabric and condition, so deciding what it can still become is slow manual work — and usually it is binned or downcycled instead.</p>
              <p>Conventional planning starts from a product and buys material for it. REFORM inverts that: it starts from the material on hand and computes which <em className="text-ink not-italic font-medium">complete</em> products can be cut from it, respecting defects, grain, seam allowance and fabric compatibility.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[1280px] px-5 py-16">
          <span className="label-caps">Workflow</span>
          <ol className="mt-6 grid gap-px bg-line border border-line md:grid-cols-4">
            {STAGES.map(([n, t, b]) => (
              <li key={n} className="bg-surface p-6">
                <span className="font-mono text-[12px] text-primary">{n}</span>
                <h3 className="mt-6 text-[18px] font-semibold">{t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-[1280px] px-5 py-16 grid gap-10 lg:grid-cols-2">
          <div>
            <span className="label-caps">The engine</span>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.02em] leading-tight">A constrained multi-bin, multi-product 2D packing solver.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">Each product unit is placed transactionally: the packing state is cloned, every required piece is attempted, and the clone is committed only if all pieces fit. Partial products never inflate the numbers.</p>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line border border-line text-[13.5px]">
            {[
              ["Baseline", "First-Fit shelf packing — the conventional row-by-row cut."],
              ["MaxRects", "Maximal free rectangles with BSSF, BAF, BL and BLSF scoring, splitting and pruning."],
              ["Search", "64 constructive strategies plus seeded local search over product mix and order, bounded by time and iterations."],
              ["Validator", "Independent re-check of containment, overlap, clearance, defects, grain, rotation, fabric and completeness."],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg p-5"><dt className="font-mono text-[12px] uppercase tracking-[0.1em]">{k}</dt><dd className="mt-2 text-muted">{v}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-line bg-surface-2/50">
        <div className="mx-auto max-w-[1280px] px-5 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <span className="label-caps">Real calculations · synthetic dataset</span>
              <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.02em]">Measured on the demonstration factory</h2>
            </div>
            <Link href="/workspace/benchmark" className="inline-flex items-center gap-1 text-[13.5px] text-primary hover:underline">Reproduce all eight benchmarks <ArrowUpRight size={14} /></Link>
          </div>
          <LiveDemoStats />
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-[1280px] px-5 py-16 grid gap-8 md:grid-cols-3 text-[14px]">
          <div>
            <span className="label-caps">Transparency</span>
            <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em]">What REFORM does not claim</h2>
          </div>
          <ul className="md:col-span-2 grid gap-3 sm:grid-cols-2 text-muted">
            <li className="border-l-2 border-accent pl-3">Allocation in a plan is not landfill diversion until the fabric is cut and verified.</li>
            <li className="border-l-2 border-accent pl-3">No carbon or water factors are applied; there is no defensible lifecycle comparison for unknown remnants.</li>
            <li className="border-l-2 border-accent pl-3">The search is heuristic: no global optimality is claimed, and baseline wins are reported when they occur.</li>
            <li className="border-l-2 border-accent pl-3">Templates are illustrative; layouts need practical production verification.</li>
          </ul>
        </div>
      </section>

      <section className="bg-[#181d19] text-[#e8eae3]">
        <div className="mx-auto max-w-[1280px] px-5 py-20 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <h2 className="text-[34px] font-semibold tracking-[-0.03em] leading-tight max-w-xl">Turn remnants into resources.</h2>
          <div className="flex gap-3">
            <Link href="/workspace" className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#cbf36a] px-5 text-[14px] font-medium text-[#171a17]">Launch workspace <ArrowRight size={16} /></Link>
            <Link href="/methodology" className="inline-flex h-11 items-center rounded-[3px] border border-[#e8eae3]/40 px-5 text-[14px]">Methodology</Link>
          </div>
        </div>
      </section>
      <footer className="mx-auto max-w-[1280px] px-5 py-6 text-[12px] text-muted flex justify-between">
        <span>REFORM · MIT licensed · hackathon build</span>
        <span>All demo data is synthetic.</span>
      </footer>
    </div>
  );
}
