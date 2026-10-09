import { useId } from "react";
import { cn } from "@/lib/cn";
import { gbp } from "@/lib/money";

const compact = (p: number) => {
  const v = Math.abs(p) / 100;
  const s = v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v.toFixed(0);
  return `${p < 0 ? "-" : ""}£${s}`;
};

/** Grouped monthly bars: income (ink) vs spend (signal). */
export function BarsChart({ data, className }: { data: { label: string; a: number; b: number }[]; className?: string }) {
  const W = 560, H = 200, P = { t: 12, r: 8, b: 28, l: 44 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const gw = iw / Math.max(data.length, 1);
  const bw = Math.min(26, gw / 2.8);
  const y = (v: number) => P.t + ih - (v / max) * ih;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", className)} role="img" aria-label="Income versus spending by month">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
          <text x={P.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{compact(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = P.l + gw * i + gw / 2;
        return (
          <g key={d.label}>
            <rect x={cx - bw - 1.5} y={y(d.a)} width={bw} height={Math.max(P.t + ih - y(d.a), 0)} rx="3" fill="var(--ink)"><title>{`${d.label} income ${gbp(d.a)}`}</title></rect>
            <rect x={cx + 1.5} y={y(d.b)} width={bw} height={Math.max(P.t + ih - y(d.b), 0)} rx="3" fill="var(--signal)"><title>{`${d.label} spend ${gbp(d.b)}`}</title></rect>
            <text x={cx} y={H - 9} textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Balance line with area; marks the lowest point. */
export function LineChart({ points, className, lowestIdx }: { points: { label: string; v: number }[]; className?: string; lowestIdx?: number }) {
  const id = useId();
  const W = 560, H = 190, P = { t: 14, r: 12, b: 26, l: 48 };
  const vs = points.map((p) => p.v);
  const min = Math.min(0, ...vs), max = Math.max(1, ...vs);
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const x = (i: number) => P.l + (i / Math.max(points.length - 1, 1)) * iw;
  const y = (v: number) => P.t + ih - ((v - min) / (max - min || 1)) * ih;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const ticks = [min, (min + max) / 2, max];
  const labelEvery = Math.ceil(points.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", className)} role="img" aria-label="Projected bank balance">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--signal)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--signal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
          <text x={P.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{compact(Math.round(t))}</text>
        </g>
      ))}
      {min < 0 ? <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="var(--destructive)" strokeDasharray="4 3" /> : null}
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
      {points.map((p, i) => (i % labelEvery === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)">{p.label}</text> : null))}
      {lowestIdx !== undefined ? <circle cx={x(lowestIdx)} cy={y(points[lowestIdx]!.v)} r="5" fill="var(--destructive)" stroke="white" strokeWidth="2" /> : null}
    </svg>
  );
}

export function Meter({ pct, tone = "ink" }: { pct: number; tone?: "ink" | "danger" | "success" }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", tone === "danger" ? "bg-destructive" : tone === "success" ? "bg-success" : "bg-ink")} style={{ width: `${p}%` }} />
    </div>
  );
}
