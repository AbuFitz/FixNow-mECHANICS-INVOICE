import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Download, FileText, Plus, Search } from "lucide-react";
import { Button, Card, Empty, Input, Menu, MenuItem, PageHeader, Spinner, Tabs } from "@/components/ui";
import { DocStatus, AmendedBadge } from "@/components/StatusBadges";
import { api } from "@/lib/api";
import { useDocs, useInvalidate, useSettings } from "@/lib/hooks";
import { balanceDue, paymentState } from "@/lib/status";
import { gbp } from "@/lib/money";
import { d } from "@/lib/format";
import { blankContent, DOC_LABEL } from "@/lib/defaults";
import type { DocType } from "@/lib/types";
import { downloadText, toCsv } from "@/lib/csv";

type Tab = "all" | "draft" | "unpaid" | "overdue" | "paid" | "quote" | "credit_note" | "void";

export function Documents() {
  const { data: docs, isLoading } = useDocs();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "all");
  const [q, setQ] = useState("");
  useEffect(() => { setParams(tab === "all" ? {} : { tab }, { replace: true }); }, [tab, setParams]);

  const rows = useMemo(() => {
    const list = docs ?? [];
    const match = (x: (typeof list)[number]) => {
      const st = paymentState(x);
      switch (tab) {
        case "draft": return x.lifecycle === "draft";
        case "unpaid": return x.lifecycle === "issued" && (x.doc_type === "invoice") && (st === "unpaid" || st === "part_paid" || st === "overdue");
        case "overdue": return st === "overdue";
        case "paid": return x.lifecycle === "issued" && (x.doc_type === "receipt" || st === "paid");
        case "quote": return x.doc_type === "quote";
        case "credit_note": return x.doc_type === "credit_note";
        case "void": return x.lifecycle === "void";
        default: return true;
      }
    };
    const needle = q.trim().toLowerCase();
    return list
      .filter(match)
      .filter((x) => !needle || `${x.number} ${x.content.customer.name} ${x.content.vehicle.registration} ${x.content.job.title} ${x.content.job.reference}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.issued_at ?? b.created_at).localeCompare(a.issued_at ?? a.created_at));
  }, [docs, tab, q]);

  if (isLoading) return <Spinner label="Loading documents" />;
  const all = docs ?? [];
  const count = (t: Tab) => all.filter((x) => { const st = paymentState(x); return t === "draft" ? x.lifecycle === "draft" : t === "overdue" ? st === "overdue" : t === "unpaid" ? x.lifecycle === "issued" && x.doc_type === "invoice" && ["unpaid", "part_paid", "overdue"].includes(st) : t === "quote" ? x.doc_type === "quote" : false; }).length;

  return (
    <div>
      <PageHeader
        title="Quotes & invoices"
        subtitle="Every quote, invoice, receipt and credit note in one place."
        actions={
          <>
            <Button onClick={() => downloadText("fixnow-documents.csv", toCsv([["Number", "Type", "Status", "Customer", "Registration", "Issued", "Due", "Total", "Paid", "Balance"], ...rows.map((x) => [x.number, DOC_LABEL[x.doc_type], paymentState(x), x.content.customer.name, x.content.vehicle.registration, x.issued_at, x.due_at, x.total_pence / 100, x.paid_pence / 100, balanceDue(x) / 100])]))}><Download className="h-4 w-4" /> CSV</Button>
            <Menu trigger={<Button variant="signal"><Plus className="h-4 w-4" /> New</Button>}>
              {(["receipt", "invoice", "quote", "credit_note"] as DocType[]).map((t) => (
                <Link key={t} to={`/documents/new?type=${t}`}><MenuItem>{DOC_LABEL[t]}</MenuItem></Link>
              ))}
            </Menu>
          </>
        }
      />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-10" placeholder="Search number, customer, registration, job…" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: "all", label: "All", count: all.length },
        { value: "draft", label: "Drafts", count: count("draft") },
        { value: "unpaid", label: "Awaiting payment", count: count("unpaid") },
        { value: "overdue", label: "Overdue", count: count("overdue") },
        { value: "paid", label: "Paid" },
        { value: "quote", label: "Quotes", count: count("quote") },
        { value: "credit_note", label: "Credit notes" },
        { value: "void", label: "Void" },
      ]} />
      <div className="mt-4 space-y-2.5">
        {rows.length === 0 ? <Empty icon={<FileText className="h-5 w-5" />} title="No documents" body="Nothing matches this view." action={<Link to="/documents/new?type=receipt"><Button variant="signal">Create a receipt</Button></Link>} /> : null}
        {rows.map((x) => (
          <Link key={x.id} to={`/documents/${x.id}`} className="press block">
            <Card className="flex items-center gap-3 p-3.5 hover:shadow-lift sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="mono font-semibold">{x.number ?? "DRAFT"}</span>
                  <span className="text-xs font-medium text-muted-foreground">{DOC_LABEL[x.doc_type]}</span>
                  <AmendedBadge doc={x} />
                </p>
                <p className="mt-0.5 truncate font-display text-base font-semibold">{x.content.customer.name || "No customer yet"}</p>
                <p className="truncate text-sm text-muted-foreground">{[x.content.vehicle.registration, x.content.job.title].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                <span className="num font-display text-base font-bold">{gbp(x.total_pence, x.content.currency)}</span>
                <DocStatus doc={x} />
                <span className="text-[11px] text-muted-foreground">{x.doc_type === "invoice" && x.lifecycle === "issued" && balanceDue(x) > 0 ? `Due ${d(x.due_at)}` : d(x.issued_at ?? x.created_at)}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function NewDocument() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { data: settings } = useSettings();
  const invalidate = useInvalidate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!settings) return;
    const type = (params.get("type") as DocType) || "receipt";
    (async () => {
      try {
        const doc = await api.docs.create({ doc_type: type, content: blankContent(settings, type), parent_id: null });
        invalidate("docs");
        nav(`/documents/${doc.id}`, { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start a new document.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  return error ? <p className="rounded-xl bg-destructive/10 p-4 text-destructive">{error}</p> : <Spinner label="Starting a new document" />;
}
