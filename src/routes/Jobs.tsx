import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2, CircleAlert, ExternalLink, FileText, MessageSquarePlus, Receipt, Send, Wrench } from "lucide-react";
import { Badge, Button, Card, Empty, PageHeader, SectionTitle, Spinner, Tabs, TextAreaField } from "@/components/ui";
import { api } from "@/lib/api";
import { useCollection, useDocs, useInfoRequests, useInvalidate, useJobs, useReports, useSettings } from "@/lib/hooks";
import { buildFromJob, jobBilledDocs, missingFromEngineer, openRequestsFor, parseQuoted } from "@/lib/jobBridge";
import type { DocType, JobReport, TrackerJob } from "@/lib/types";
import { d, dt } from "@/lib/format";
import { DOC_LABEL } from "@/lib/defaults";
import { gbp } from "@/lib/money";
import { DocStatus } from "@/components/StatusBadges";
import { useQuery } from "@tanstack/react-query";

type Tab = "ready" | "info" | "billed" | "upcoming" | "all";

function jobState(job: TrackerJob, report: JobReport | undefined, billed: number, openReq: number) {
  if (job.status !== "completed") return { key: "upcoming" as const, label: job.status === "cancelled" ? "Cancelled" : "Upcoming", tone: "neutral" as const };
  if (billed) return { key: "billed" as const, label: "Billed", tone: "success" as const };
  if (openReq || report?.status === "needs_info") return { key: "info" as const, label: "Waiting on engineer", tone: "warning" as const };
  if (!report || report.status === "draft") return { key: "info" as const, label: "No report yet", tone: "warning" as const };
  return { key: "ready" as const, label: "Ready to bill", tone: "signal" as const };
}

export function Jobs() {
  const jobs = useJobs();
  const reports = useReports();
  const docs = useDocs();
  const reqs = useInfoRequests();
  const [tab, setTab] = useState<Tab>("ready");
  const rows = useMemo(() => {
    return (jobs.data ?? []).map((j) => {
      const report = (reports.data ?? []).find((r) => r.session_id === j.id);
      const billed = jobBilledDocs(j.id, docs.data ?? []);
      const open = openRequestsFor(j.id, reqs.data ?? []);
      return { job: j, report, billed, open, state: jobState(j, report, billed.length, open.length) };
    });
  }, [jobs.data, reports.data, docs.data, reqs.data]);
  if (jobs.isLoading || docs.isLoading) return <Spinner label="Loading jobs" />;

  const count = (k: Tab) => rows.filter((r) => (k === "all" ? true : r.state.key === k)).length;
  const shown = rows.filter((r) => (tab === "all" ? true : r.state.key === tab));
  return (
    <div>
      <PageHeader title="Jobs to bill" subtitle="Jobs completed in FixNow Tracking, with the engineer's report, photos and payment details — ready to turn into paperwork." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "ready", label: "Ready to bill", count: count("ready") },
          { value: "info", label: "Needs info", count: count("info") },
          { value: "billed", label: "Billed", count: count("billed") },
          { value: "upcoming", label: "Upcoming", count: count("upcoming") },
          { value: "all", label: "All", count: count("all") },
        ]}
      />
      <div className="mt-4 space-y-3">
        {shown.length === 0 ? (
          <Empty icon={<Wrench className="h-5 w-5" />} title="Nothing here" body={tab === "ready" ? "When an engineer completes a job and submits their report, it lands here." : "No jobs in this view."} />
        ) : null}
        {shown.map(({ job, report, billed, state }) => (
          <Link key={job.id} to={`/jobs/${job.id}`} className="press block">
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:shadow-lift">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="mono font-semibold">{job.job_reference}</span>
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {report?.status === "needs_info" ? <Badge tone="warning">Info requested</Badge> : null}
                </p>
                <p className="mt-1 truncate font-display text-lg font-semibold">{job.customer_first_name} · {job.vehicle_description ?? job.vehicle_registration}</p>
                <p className="text-sm text-muted-foreground">{job.vehicle_registration} · {d(job.completed_at ?? job.appointment_at)} · {job.engineer_name ?? "Unassigned"}{job.quoted_price ? ` · Quoted ${job.quoted_price}` : ""}</p>
              </div>
              <div className="text-right text-sm">
                {billed[0] ? <p className="mono">{billed[0].number ?? "Draft"}</p> : null}
                {billed[0] ? <p className="num font-display font-semibold">{gbp(billed[0].total_pence)}</p> : null}
                {!billed[0] && report ? <p className="text-muted-foreground">{report.parts.length} part{report.parts.length === 1 ? "" : "s"} · {report.advisories.length} advisor{report.advisories.length === 1 ? "y" : "ies"}</p> : null}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const jobs = useJobs();
  const reports = useReports();
  const docs = useDocs();
  const reqs = useInfoRequests();
  const settings = useSettings();
  const presets = useCollection("presets");
  const invalidate = useInvalidate();
  const photos = useQuery({ queryKey: ["photos", id], queryFn: () => api.tracker.photos(id!), enabled: !!id });
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string>("");

  const job = (jobs.data ?? []).find((j) => j.id === id);
  if (jobs.isLoading || reports.isLoading || settings.isLoading) return <Spinner label="Loading job" />;
  if (!job) return <Empty title="Job not found" action={<Link to="/jobs"><Button>Back to jobs</Button></Link>} />;

  const report = (reports.data ?? []).find((r) => r.session_id === job.id);
  const billed = jobBilledDocs(job.id, docs.data ?? []);
  const requests = (reqs.data ?? []).filter((r) => r.session_id === job.id);
  const missing = missingFromEngineer(job, report);
  const blockers = missing.filter((m) => m.severity === "block");
  const trackerUrl = settings.data?.tracker_url;

  async function create(type: DocType) {
    setBusy(type);
    try {
      const built = buildFromJob({ job: job!, report, photos: photos.data ?? [], settings: settings.data!, presets: presets.data ?? [], docType: type });
      if (built.payment && type !== "quote") built.content.pending_payment = { amount_pence: built.payment.amount_pence, method: built.payment.method, reference: built.payment.reference };
      const doc = await api.docs.create({ doc_type: type, content: built.content, session_id: job!.id });
      await api.tracker.setReportStatus(job!.id, "reviewed");
      invalidate("docs", "reports");
      nav(`/documents/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the document.");
    } finally {
      setBusy(null);
    }
  }

  async function ask(prompt: string) {
    if (!prompt.trim()) return;
    setBusy("ask");
    try {
      await api.tracker.requestInfo(job!.id, prompt.trim());
      setAsking("");
      invalidate("info-requests", "reports");
      toast.success("Sent to the engineer — it will appear on their job page.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that.");
    } finally {
      setBusy(null);
    }
  }

  const composed = missing.filter((m) => m.key !== "report").map((m, i) => `${i + 1}. ${m.ask}`).join("\n");
  const quoted = parseQuoted(job.quoted_price);

  return (
    <div className="space-y-5">
      <Link to="/jobs" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Jobs</Link>
      <PageHeader
        title={`${job.job_reference} · ${job.customer_first_name}`}
        subtitle={`${job.vehicle_description ?? ""} ${job.vehicle_registration} · ${job.customer_postcode} · ${job.engineer_name ?? "Unassigned"} · ${dt(job.completed_at ?? job.appointment_at)}`}
        actions={trackerUrl ? <a href={`${trackerUrl.replace(/\/$/, "")}/admin/session/${job.id}`} target="_blank" rel="noreferrer"><Button><ExternalLink className="h-4 w-4" /> Open in Tracking</Button></a> : undefined}
      />

      {billed.length ? (
        <Card className="p-4">
          <SectionTitle>Paperwork for this job</SectionTitle>
          <ul className="mt-3 divide-y divide-hairline">
            {billed.map((b) => (
              <li key={b.id}>
                <Link to={`/documents/${b.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <span><span className="mono font-semibold">{b.number ?? "Draft"}</span> <span className="text-muted-foreground">· {DOC_LABEL[b.doc_type]}</span></span>
                  <span className="flex items-center gap-3"><span className="num font-display font-semibold">{gbp(b.total_pence)}</span><DocStatus doc={b} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Make paperwork */}
      <Card className="p-4 sm:p-5">
        <SectionTitle>Create paperwork</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">Everything the engineer recorded — parts, labour time, advisories, photos, sign-off and any payment taken — is pulled into an editable draft.</p>
        {quoted !== null ? <p className="mt-1 text-sm">Quoted at booking: <strong>{job.quoted_price}</strong></p> : job.quoted_price ? <p className="mt-1 text-sm">Quoted at booking: <strong>{job.quoted_price}</strong></p> : null}
        {blockers.length ? <p className="mt-3 flex gap-2 rounded-xl bg-warning/15 p-3 text-sm"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> The engineer hasn't finished the report. You can still create a draft, but ask them for the missing details below first.</p> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button size="lg" variant="signal" loading={busy === "receipt"} onClick={() => create("receipt")}><Receipt className="h-5 w-5" /> Receipt (paid)</Button>
          <Button size="lg" variant="ink" loading={busy === "invoice"} onClick={() => create("invoice")}><FileText className="h-5 w-5" /> Invoice</Button>
          <Button size="lg" loading={busy === "quote"} onClick={() => create("quote")}><Send className="h-5 w-5" /> Quote</Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Missing info */}
        <Card className="p-4 sm:p-5">
          <SectionTitle>Information from the engineer</SectionTitle>
          {missing.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Complete — nothing outstanding.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {missing.map((m) => (
                  <li key={m.key} className="flex items-start gap-2.5 text-sm">
                    <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${m.severity === "block" ? "text-destructive" : "text-warning"}`} />
                    <span>{m.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-3">
                <TextAreaField label="Message to the engineer" value={asking || composed} onChange={(e) => setAsking(e.target.value)} className="[&_textarea]:min-h-32" hint="Shown on their job page in FixNow Tracking until they answer." />
                <Button variant="ink" loading={busy === "ask"} onClick={() => ask(asking || composed)}><MessageSquarePlus className="h-4 w-4" /> Ask {job.engineer_name?.split(" ")[0] ?? "engineer"}</Button>
              </div>
            </>
          )}
          {requests.length ? (
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="eyebrow mb-2 text-muted-foreground">Requests</p>
              <ul className="space-y-3">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <p className="whitespace-pre-line">{r.prompt}</p>
                    {r.response ? <p className="mt-2 rounded-lg bg-card p-2.5"><span className="eyebrow block text-muted-foreground">Engineer replied</span>{r.response}</p> : null}
                    <div className="mt-2 flex items-center justify-between">
                      <Badge tone={r.status === "open" ? "warning" : r.status === "answered" ? "success" : "neutral"}>{r.status}</Badge>
                      {r.status !== "closed" ? <Button size="sm" variant="ghost" onClick={async () => { await api.tracker.closeInfoRequest(r.id); invalidate("info-requests"); }}>Close</Button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {/* Report */}
        <Card className="p-4 sm:p-5">
          <SectionTitle>Engineer's report</SectionTitle>
          {!report ? <p className="mt-3 text-sm text-muted-foreground">No report has been submitted for this job.</p> : (
            <div className="mt-3 space-y-4 text-sm">
              <div><p className="eyebrow text-muted-foreground">Work</p><p className="mt-1">{report.work_summary || "—"}</p></div>
              {report.condition_on_arrival ? <div><p className="eyebrow text-muted-foreground">Condition on arrival</p><p className="mt-1">{report.condition_on_arrival}</p></div> : null}
              <div>
                <p className="eyebrow text-muted-foreground">Parts</p>
                {report.parts.length ? <ul className="mt-1 space-y-1">{report.parts.map((p, i) => <li key={i}>{p.qty}× {p.name} <span className="mono text-muted-foreground">{[p.part_number, p.serial].filter(Boolean).join(" · ")}</span> {p.unit_price_pence !== null ? <strong>{gbp(p.unit_price_pence)}</strong> : <Badge tone="warning">no price</Badge>}</li>)}</ul> : <p className="mt-1">—</p>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="eyebrow text-muted-foreground">Time</p><p className="mt-1">{report.labour_minutes ? `${report.labour_minutes} min` : "—"}</p></div>
                <div><p className="eyebrow text-muted-foreground">Mileage</p><p className="mt-1">{report.mileage ? report.mileage.toLocaleString("en-GB") : "—"}</p></div>
                <div><p className="eyebrow text-muted-foreground">Payment</p><p className="mt-1">{report.payment?.taken ? `${gbp(report.payment.amount_pence ?? 0)} ${report.payment.method?.replace("_", " ")}` : report.payment ? "Not taken" : "—"}</p></div>
              </div>
              <div>
                <p className="eyebrow text-muted-foreground">Advisories</p>
                {report.advisories.length ? <ul className="mt-1 space-y-1">{report.advisories.map((a) => <li key={a.id}><Badge tone={a.severity === "urgent" ? "danger" : a.severity === "soon" ? "warning" : "info"}>{a.severity}</Badge> {a.title}{a.declined ? " (declined)" : ""}</li>)}</ul> : <p className="mt-1">None recorded.</p>}
              </div>
              {report.signoff ? <p className="text-success">Signed by {report.signoff.name}, {dt(report.signoff.signed_at)}</p> : <p className="text-muted-foreground">No customer sign-off.</p>}
              {report.engineer_notes ? <div><p className="eyebrow text-muted-foreground">Engineer notes</p><p className="mt-1">{report.engineer_notes}</p></div> : null}
            </div>
          )}
          {(photos.data ?? []).length ? (
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="eyebrow mb-2 flex items-center gap-1.5 text-muted-foreground"><Camera className="h-3.5 w-3.5" /> Photos ({photos.data!.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {photos.data!.filter((p) => p.category !== "receipt_warranty").map((p) => (
                  <figure key={p.id}>
                    <img src={p.photo_url} alt={p.caption ?? p.category} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                    <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">{p.category.replace("_", " ")}{p.caption ? ` · ${p.caption}` : ""}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
