import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type Variant = "signal" | "ink" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  signal: "bg-signal text-signal-foreground hover:bg-signal-deep shadow-card",
  ink: "bg-ink text-ink-foreground hover:bg-ink-soft",
  outline: "border border-hairline bg-surface text-foreground hover:bg-surface-2",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "border border-destructive/30 text-destructive hover:bg-destructive/8",
  success: "bg-success text-white hover:opacity-90",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
};

export function Button({
  variant = "outline",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "press inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-display font-semibold outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
const fieldBase =
  "w-full rounded-xl border border-hairline bg-surface px-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-signal-deep focus:ring-2 focus:ring-signal/40 disabled:bg-surface-2 disabled:text-muted-foreground";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11", className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-[84px] resize-y py-2.5 leading-relaxed", className)} {...p} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="eyebrow text-muted-foreground">
        {label}
      </label>
      <div id={id}>{children}</div>
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Field with a real input so the label is correctly associated. */
export function TextField({ label, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="eyebrow text-muted-foreground">
        {label}
      </label>
      <Input id={id} aria-invalid={!!error} {...p} />
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
export function TextAreaField({ label, hint, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="eyebrow text-muted-foreground">
        {label}
      </label>
      <Textarea id={id} {...p} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
export function SelectField({ label, hint, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="eyebrow text-muted-foreground">
        {label}
      </label>
      <Select id={id} {...p}>
        {children}
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** £ input that edits integer pence through a decimal string. */
export function MoneyInput({ value, onChange, className, ...p }: { value: number; onChange: (pence: number) => void; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value ? (value / 100).toFixed(2) : "");
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value ? (value / 100).toFixed(2) : "");
    }
  }, [value]);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
      <Input
        inputMode="decimal"
        className="num pl-7 text-right"
        value={text}
        placeholder="0.00"
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9.\-]/g, "");
          setText(t);
          const n = Math.round(parseFloat(t || "0") * 100);
          const v = Number.isFinite(n) ? n : 0;
          last.current = v;
          onChange(v);
        }}
        onBlur={() => setText(value ? (value / 100).toFixed(2) : "")}
        {...p}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2", checked ? "bg-ink" : "bg-hairline")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px] bg-signal" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex w-full rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("min-h-9 flex-1 rounded-lg px-3 text-[13px] font-semibold transition-all", value === o.value ? "bg-ink text-ink-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-hairline bg-card shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <span className="h-3.5 w-1 rounded-full bg-signal" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const TONE: Record<string, string> = {
  neutral: "bg-surface-2 text-foreground border-hairline",
  signal: "bg-signal/25 text-signal-foreground border-signal-deep/40",
  success: "bg-success/12 text-success border-success/30",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
  warning: "bg-warning/15 text-[oklch(0.45_0.1_60)] border-warning/40",
  info: "bg-info/10 text-info border-info/25",
  ink: "bg-ink text-ink-foreground border-ink",
};
export type Tone = keyof typeof TONE;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "danger" | "success" | "warning"; className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className={cn("num mt-2 font-display text-2xl font-bold leading-none", tone === "danger" && "text-destructive", tone === "success" && "text-success")}>{value}</p>
      {sub ? <p className="mt-2 text-xs text-muted-foreground">{sub}</p> : null}
    </Card>
  );
}

export function Empty({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface px-6 py-12 text-center">
      {icon ? <div className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-signal/20 text-signal-foreground">{icon}</div> : null}
      <p className="font-display text-base font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-muted-foreground" role="status">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> {label}…
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog / sheet
// ---------------------------------------------------------------------------
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("rise-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-lift outline-none sm:rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-hairline bg-surface-2/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>
  );
}

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return { open, show: () => setOpen(true), hide: () => setOpen(false), toggle: () => setOpen((v) => !v), setOpen };
}

/** Lightweight dropdown menu. */
export function Menu({ trigger, children, align = "right" }: { trigger: ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div role="menu" onClick={() => setOpen(false)} className={cn("rise-in absolute z-40 mt-2 min-w-56 overflow-hidden rounded-2xl border border-hairline bg-card py-1.5 shadow-lift", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
export function MenuItem({ icon, children, danger, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <button role="menuitem" type="button" className={cn("flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-40", danger && "text-destructive")} {...rest}>
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      {children}
    </button>
  );
}
export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow px-4 pb-1 pt-2 text-muted-foreground">{children}</p>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn("flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors", value === t.value ? "bg-ink text-ink-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground")}
        >
          {t.label}
          {t.count !== undefined ? <span className={cn("num rounded-full px-1.5 text-[11px]", value === t.value ? "bg-signal text-signal-foreground" : "bg-hairline")}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Money({ pence, className, currency = "GBP" }: { pence: number; className?: string; currency?: string }) {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence) / 100;
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  const body = abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <span className={cn("num", className)}>{`${sign}${sym}${body}${sym ? "" : " " + currency}`}</span>;
}
