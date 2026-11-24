export function LogoMark({ size = 22 }: { size?: number }) {
  // A remnant outline with three packed pieces; the lime block is the recovered piece.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1.5" y="1.5" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4.5" y="4.5" width="8" height="15" fill="currentColor" />
      <rect x="14" y="4.5" width="5.5" height="7" fill="var(--accent)" stroke="currentColor" strokeWidth="1" />
      <rect x="14" y="13" width="5.5" height="6.5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.2" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-[0.18em] text-[13px] ${className}`}>
      <LogoMark />
      REFORM
    </span>
  );
}
