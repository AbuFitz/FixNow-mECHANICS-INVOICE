import { useState } from "react";
import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Card, Input, PageHeader, Spinner } from "@/components/ui";
import { useDocs, useEvents } from "@/lib/hooks";
import { dt } from "@/lib/format";

export function Activity() {
  const { data, isLoading } = useEvents();
  const { data: docs } = useDocs();
  const [q, setQ] = useState("");
  if (isLoading) return <Spinner />;
  const byId = new Map((docs ?? []).map((d) => [d.id, d]));
  const rows = (data ?? []).filter((e) => `${e.kind} ${byId.get(e.document_id ?? "")?.number ?? ""} ${e.actor}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Activity log" subtitle="A permanent audit trail of every issue, amendment, payment, share and customer response." />
      <Input className="mb-4" placeholder="Filter…" aria-label="Filter activity" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="divide-y divide-hairline">
        {rows.slice(0, 200).map((e) => {
          const doc = e.document_id ? byId.get(e.document_id) : null;
          return (
            <div key={e.id} className="flex items-start gap-3 p-3.5 text-sm">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium capitalize">{e.kind.replace(/_/g, " ")}{doc ? <> · <Link className="mono underline decoration-signal decoration-2 underline-offset-4" to={`/documents/${doc.id}`}>{doc.number ?? "draft"}</Link></> : null}</p>
                <p className="text-xs text-muted-foreground">{dt(e.created_at)} · {e.actor}{typeof e.detail?.reason === "string" && e.detail.reason ? ` · ${e.detail.reason}` : ""}</p>
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing yet.</p> : null}
      </Card>
    </div>
  );
}
