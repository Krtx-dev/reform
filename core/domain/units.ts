export type LengthUnit = "mm" | "cm" | "m";

const FACTOR: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** Convert a value in `unit` to integer millimetres (rounded half away from zero). */
export function toMm(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) return NaN;
  const mm = value * FACTOR[unit];
  return Math.sign(mm) * Math.round(Math.abs(mm) + 1e-9);
}

export function fromMm(mm: number, unit: LengthUnit): number {
  return mm / FACTOR[unit];
}

export function formatLength(mm: number, unit: LengthUnit, digits?: number): string {
  const v = fromMm(mm, unit);
  const d = digits ?? (unit === "mm" ? 0 : unit === "cm" ? 1 : 3);
  return `${v.toFixed(d)} ${unit}`;
}

export const MM2_PER_M2 = 1_000_000;

export function mm2ToM2(mm2: number): number {
  return mm2 / MM2_PER_M2;
}

export function formatArea(mm2: number, digits = 3): string {
  return `${mm2ToM2(mm2).toFixed(digits)} m²`;
}

export function formatPct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Estimated mass in kg = area (m²) × GSM (g/m²) ÷ 1000. */
export function massKg(areaMm2: number, gsm: number): number {
  return (mm2ToM2(areaMm2) * gsm) / 1000;
}
