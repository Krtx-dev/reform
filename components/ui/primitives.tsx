"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/id";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink border-primary hover:brightness-110",
  accent: "bg-accent text-accent-ink border-accent hover:brightness-95",
  secondary: "bg-surface text-ink border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink border-transparent hover:bg-surface-2",
  danger: "bg-surface text-err border-line-strong hover:bg-err-soft",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 border rounded-[3px] font-medium whitespace-nowrap transition-[filter,background-color] disabled:opacity-45 disabled:pointer-events-none select-none",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-[3px] text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-40", className)} {...rest}>
      {children}
    </button>
  );
}

const fieldBase = "w-full h-9 rounded-[3px] border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-err";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "pr-7 appearance-none bg-[length:10px] bg-no-repeat bg-[position:right_8px_center]", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' fill='none'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "h-auto min-h-[72px] py-2", className)} {...rest} />;
}

export function Field({ label, hint, error, children, className, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink/85">
        {label}
      </label>
      {children}
      {error ? <p className="text-[11.5px] text-err">{error}</p> : hint ? <p className="text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function useFieldId() {
  return useId();
}

export function Checkbox({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex items-start gap-2 text-[13px] cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed")}>
      <input id={id} type="checkbox" className="mt-[2px] h-3.5 w-3.5 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {description && <span className="block text-[11.5px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "green" | "lime" | "warn" | "err" | "dark"; className?: string }) {
  const tones = {
    neutral: "border-line-strong text-muted bg-surface",
    green: "border-primary/30 text-primary bg-primary-soft",
    lime: "border-transparent text-accent-ink bg-accent",
    warn: "border-warn/30 text-warn bg-warn-soft",
    err: "border-err/30 text-err bg-err-soft",
    dark: "border-transparent bg-ink text-bg",
  };
  return <span className={cn("inline-flex items-center gap-1 h-5 px-1.5 border rounded-[2px] font-mono text-[10.5px] uppercase tracking-[0.06em] whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Panel({ title, actions, children, className, bodyClass, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section id={id} className={cn("border border-line bg-surface rounded-[3px]", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 h-11">
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Metric({ label, value, unit, sub, tone, className }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: "lime" | "green" | "default"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 min-w-0", className)}>
      <span className="label-caps">{label}</span>
      <span className={cn("num text-[22px] leading-none tracking-tight", tone === "green" && "text-primary")}>
        {tone === "lime" ? <mark className="bg-accent text-accent-ink px-1">{value}</mark> : value}
        {unit && <span className="ml-1 text-[12px] text-muted">{unit}</span>}
      </span>
      {sub && <span className="text-[11.5px] text-muted">{sub}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-14 px-6 border border-dashed border-line-strong rounded-[3px] tech-grid">
      {icon && <div className="text-muted">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <div className="text-[13px] text-muted max-w-md">{body}</div>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[2px] border border-line-strong bg-surface px-1 font-mono text-[10.5px] text-muted">{children}</kbd>;
}

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 p-4 pt-[8vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn("w-full bg-surface border border-line-strong rounded-[3px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]", wide ? "max-w-4xl" : "max-w-xl")}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <header className="flex items-center justify-between border-b border-line px-5 h-12">
              <h2 className="text-[14px] font-semibold">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </header>
            <div className="p-5 max-h-[70vh] overflow-y-auto scroll-thin">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 bg-surface-2/50">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; size?: Size; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-line-strong rounded-[3px] bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn("px-2.5 rounded-[2px] font-medium transition-colors", size === "sm" ? "h-6 text-[11.5px]" : "h-7 text-[12.5px]", value === o.value ? "bg-ink text-bg" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="label-caps mb-1.5">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1.5 text-[13.5px] text-muted max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Swatch({ color, size = 14 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 border border-ink/15 rounded-[2px]" style={{ width: size, height: size, background: color }} />;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full bg-surface-2 rounded-[1px] overflow-hidden", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
