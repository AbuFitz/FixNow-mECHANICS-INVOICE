import { format, parseISO, isValid, differenceInCalendarDays, addDays } from "date-fns";

export function d(value: string | Date | null | undefined, pattern = "dd MMM yyyy"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? format(date, pattern) : "—";
}

export function dt(value: string | null | undefined): string {
  return d(value, "dd MMM yyyy, HH:mm");
}

export function isoDate(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

export function addDaysIso(iso: string | Date, days: number): string {
  const base = typeof iso === "string" ? parseISO(iso) : iso;
  return isoDate(addDays(base, days));
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === "string" ? parseISO(a) : a;
  const db = typeof b === "string" ? parseISO(b) : b;
  return differenceInCalendarDays(da, db);
}

export function uid(): string {
  return crypto.randomUUID();
}

export function token(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}

export function formatReg(reg: string): string {
  return reg.toUpperCase().replace(/\s+/g, " ").trim();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
