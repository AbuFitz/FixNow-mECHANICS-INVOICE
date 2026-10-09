import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  BarChart3, BookOpen, Briefcase, Building2, Calculator, ClipboardList, FileText, FolderKanban, Gauge, HardHat, Home, Landmark, LayoutGrid, LogOut, Menu as MenuIcon, ReceiptText, Settings, ShoppingCart, Users, Wallet, X, Percent, Wrench, Activity, FlaskConical,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { api, isDemo } from "@/lib/api";
import { resetDemo } from "@/lib/api/demo";
import { Button } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Sales",
    items: [
      { to: "/", label: "Dashboard", icon: Home, end: true },
      { to: "/jobs", label: "Jobs to bill", icon: Wrench },
      { to: "/documents", label: "Quotes & invoices", icon: FileText },
      { to: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    title: "Purchases",
    items: [
      { to: "/bills", label: "Bills", icon: ShoppingCart },
      { to: "/expenses", label: "Expenses & mileage", icon: ReceiptText },
      { to: "/suppliers", label: "Suppliers", icon: Building2 },
    ],
  },
  {
    title: "Banking",
    items: [{ to: "/banking", label: "Bank & reconcile", icon: Landmark }],
  },
  {
    title: "Accounting",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/cashflow", label: "Cash flow forecast", icon: Wallet },
      { to: "/budgets", label: "Budgets", icon: Gauge },
      { to: "/vat", label: "VAT returns", icon: Percent },
      { to: "/cis", label: "CIS", icon: HardHat },
      { to: "/payroll", label: "Payroll", icon: Briefcase },
      { to: "/projects", label: "Projects & time", icon: FolderKanban },
      { to: "/tax", label: "Tax & year-end", icon: Calculator },
    ],
  },
  {
    title: "Setup",
    items: [
      { to: "/catalogue", label: "Catalogue", icon: BookOpen },
      { to: "/activity", label: "Activity log", icon: Activity },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const MOBILE: NavItem[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/jobs", label: "Jobs", icon: Wrench },
  { to: "/documents", label: "Docs", icon: FileText },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="eyebrow mb-2 px-3 text-white/40">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn("group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", isActive ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? <span className="absolute -left-1 top-2 h-7 w-1 rounded-full bg-signal" /> : null}
                      <n.icon className={cn("h-[18px] w-[18px]", isActive && "text-signal")} />
                      {n.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Shell() {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const qc = useQueryClient();
  const isEditor = /^\/documents\/[^/]+$/.test(loc.pathname) && loc.pathname !== "/documents/new";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-ink px-4 py-6 lg:flex">
        <div className="px-3 pb-6">
          <Logo className="text-xl" />
          <p className="eyebrow mt-2 text-white/40">Billing &amp; accounts</p>
        </div>
        <div className="flex-1">
          <NavList />
        </div>
        <button
          onClick={async () => {
            await api.auth.signOut();
            window.location.assign("/login");
          }}
          className="mt-6 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <Logo className="text-lg" />
        <Button variant="ghost" aria-label="Menu" className="w-11 px-0 text-white hover:bg-white/10" onClick={() => setMore(true)}>
          <MenuIcon className="h-5 w-5" />
        </Button>
      </header>

      <main className={cn("min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8", isEditor && "pt-0 lg:pt-0")}>
        {isDemo ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-signal/25 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4" /> Demo mode — sample data stored in this browser only. Connect Supabase to go live.</span>
            <button className="font-semibold underline underline-offset-4" onClick={() => { resetDemo(); qc.clear(); window.location.reload(); }}>Reset demo</button>
          </div>
        ) : null}
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", isActive ? "text-foreground" : "text-muted-foreground")}>
                {({ isActive }) => (
                  <>
                    <span className={cn("grid h-7 w-12 place-items-center rounded-full", isActive && "bg-signal")}>
                      <n.icon className="h-[18px] w-[18px]" />
                    </span>
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button onClick={() => setMore(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground">
              <span className="grid h-7 w-12 place-items-center rounded-full"><LayoutGrid className="h-[18px] w-[18px]" /></span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Mobile menu */}
      {more ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setMore(false)} />
          <div className="rise-in absolute inset-y-0 right-0 w-[86%] max-w-sm overflow-y-auto bg-ink px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
            <div className="mb-6 flex items-center justify-between px-3">
              <Logo className="text-lg" />
              <button aria-label="Close menu" onClick={() => setMore(false)} className="grid h-10 w-10 place-items-center rounded-full text-white hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <NavList onNavigate={() => setMore(false)} />
            <button
              onClick={async () => { await api.auth.signOut(); window.location.assign("/login"); }}
              className="mt-6 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-[18px] w-[18px]" /> Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { ClipboardList };
