-- ---------------------------------------------------------------------------
-- FixNow Billing — core schema. Shares the Supabase project with FixNow
-- Tracking: apply the tracker's migrations FIRST (this file references
-- public.tracking_sessions), then this one.
--
-- Model, in one paragraph: sales documents (quote / invoice / receipt /
-- credit note) and their payments are real relational tables because numbering,
-- payment totals and the customer-facing link must be atomic. Everything in the
-- long tail of the accounting suite (contacts, bills, expenses, bank
-- transactions, projects, time, budgets, employees, pay runs, VAT returns,
-- chart of accounts, presets) is stored as JSON rows in billing_records —
-- one admin, small data, all aggregation happens in the app.
--
-- Access model (same as the tracker): `authenticated` = the FixNow admin, full
-- access. `anon` = nothing directly; the customer link goes through
-- security-definer RPCs gated by an unguessable per-document token.
-- ---------------------------------------------------------------------------

create table if not exists public.billing_settings (
  id integer primary key check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_counters (
  key text primary key,
  value integer not null default 0
);

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('quote', 'invoice', 'receipt', 'credit_note')),
  number text unique,
  lifecycle text not null default 'draft' check (lifecycle in ('draft', 'issued', 'void')),
  quote_outcome text not null default 'pending' check (quote_outcome in ('pending', 'accepted', 'declined')),
  revision integer not null default 1,
  session_id uuid references public.tracking_sessions(id) on delete set null,
  contact_id uuid,
  parent_id uuid references public.billing_documents(id) on delete set null,
  project_id uuid,
  share_token text not null unique,
  issued_at date,
  due_at date,
  valid_until date,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  content jsonb not null,
  total_pence bigint not null default 0,
  paid_pence bigint not null default 0,
  credited_pence bigint not null default 0,
  pay_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_documents_session_idx on public.billing_documents(session_id);
create index if not exists billing_documents_type_idx on public.billing_documents(doc_type, lifecycle);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.billing_documents(id) on delete cascade,
  amount_pence bigint not null,
  method text not null default 'bank_transfer',
  paid_at date not null default current_date,
  reference text not null default '',
  note text not null default '',
  bank_txn_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists billing_payments_doc_idx on public.billing_payments(document_id);

create table if not exists public.billing_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.billing_documents(id) on delete cascade,
  revision integer not null,
  reason text not null default '',
  content jsonb not null,
  total_pence bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.billing_documents(id) on delete cascade,
  session_id uuid references public.tracking_sessions(id) on delete set null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index if not exists billing_events_doc_idx on public.billing_events(document_id, created_at desc);

create table if not exists public.billing_records (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_records_collection_idx on public.billing_records(collection);

-- ---------------------------------------------------------------------------
-- RLS + grants (service_role needs explicit grants — see tracker AGENTS.md).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'billing_settings','billing_counters','billing_documents','billing_payments',
    'billing_document_revisions','billing_events','billing_records'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated full access" on public.%I', t);
    execute format('create policy "Authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Payment + credit-note roll-ups.
-- ---------------------------------------------------------------------------
create or replace function public.billing_refresh_paid() returns trigger
language plpgsql as $$
declare doc uuid;
begin
  doc := coalesce(new.document_id, old.document_id);
  update public.billing_documents
     set paid_pence = coalesce((select sum(amount_pence) from public.billing_payments where document_id = doc), 0),
         updated_at = now()
   where id = doc;
  return null;
end $$;

drop trigger if exists billing_payments_roll on public.billing_payments;
create trigger billing_payments_roll
  after insert or update or delete on public.billing_payments
  for each row execute function public.billing_refresh_paid();

create or replace function public.billing_refresh_credited() returns trigger
language plpgsql as $$
declare parent uuid;
begin
  parent := coalesce(new.parent_id, old.parent_id);
  if parent is null then return null; end if;
  update public.billing_documents p
     set credited_pence = coalesce((
           select sum(c.total_pence) from public.billing_documents c
            where c.parent_id = parent and c.doc_type = 'credit_note' and c.lifecycle = 'issued'), 0)
   where p.id = parent;
  return null;
end $$;

drop trigger if exists billing_credit_roll on public.billing_documents;
create trigger billing_credit_roll
  after insert or update or delete on public.billing_documents
  for each row execute function public.billing_refresh_credited();

-- ---------------------------------------------------------------------------
-- Issue / amend / void — atomic, authenticated only.
-- ---------------------------------------------------------------------------
create or replace function public.billing_issue_document(p_id uuid)
returns public.billing_documents
language plpgsql
as $$
declare
  d public.billing_documents;
  s jsonb;
  prefix text;
  yr integer := extract(year from now())::integer;
  n integer;
  terms integer;
begin
  select * into d from public.billing_documents where id = p_id for update;
  if not found then raise exception 'Document not found'; end if;
  select data into s from public.billing_settings where id = 1;
  s := coalesce(s, '{}'::jsonb);

  if d.number is null then
    prefix := coalesce(s->'numbering'->>d.doc_type,
      case d.doc_type when 'quote' then 'QT' when 'invoice' then 'INV' when 'receipt' then 'RCT' else 'CN' end);
    insert into public.billing_counters(key, value) values (d.doc_type || '-' || yr, 1)
      on conflict (key) do update set value = public.billing_counters.value + 1
      returning value into n;
    d.number := prefix || '-' || yr || '-' || lpad(n::text, 4, '0');
  end if;

  d.lifecycle := 'issued';
  d.issued_at := coalesce(d.issued_at, current_date);
  if d.doc_type = 'invoice' then
    terms := coalesce((d.content->>'payment_terms_days')::integer, 7);
    d.due_at := d.issued_at + terms;
  elsif d.doc_type = 'quote' then
    d.valid_until := d.issued_at + coalesce((s->'defaults'->>'quote_valid_days')::integer, 30);
  end if;

  update public.billing_documents
     set number = d.number, lifecycle = d.lifecycle, issued_at = d.issued_at, due_at = d.due_at,
         valid_until = d.valid_until, updated_at = now()
   where id = p_id
   returning * into d;

  insert into public.billing_events(document_id, session_id, kind, detail, actor)
    values (d.id, d.session_id, 'issued', jsonb_build_object('number', d.number), coalesce(auth.jwt()->>'email', 'system'));
  return d;
end $$;

create or replace function public.billing_amend_document(p_id uuid, p_content jsonb, p_total bigint, p_reason text)
returns public.billing_documents
language plpgsql
as $$
declare d public.billing_documents;
begin
  select * into d from public.billing_documents where id = p_id for update;
  if not found then raise exception 'Document not found'; end if;
  insert into public.billing_document_revisions(document_id, revision, reason, content, total_pence)
    values (d.id, d.revision, coalesce(p_reason, ''), d.content, d.total_pence)
    on conflict (document_id, revision) do nothing;
  update public.billing_documents
     set content = p_content, total_pence = p_total, revision = d.revision + 1, updated_at = now()
   where id = p_id
   returning * into d;
  insert into public.billing_events(document_id, session_id, kind, detail, actor)
    values (d.id, d.session_id, 'amended', jsonb_build_object('revision', d.revision, 'reason', p_reason),
            coalesce(auth.jwt()->>'email', 'system'));
  return d;
end $$;

create or replace function public.billing_set_void(p_id uuid, p_void boolean, p_reason text)
returns public.billing_documents
language plpgsql
as $$
declare d public.billing_documents;
begin
  update public.billing_documents
     set lifecycle = case when p_void then 'void' when number is null then 'draft' else 'issued' end,
         updated_at = now()
   where id = p_id
   returning * into d;
  if not found then raise exception 'Document not found'; end if;
  insert into public.billing_events(document_id, session_id, kind, detail, actor)
    values (d.id, d.session_id, case when p_void then 'voided' else 'unvoided' end,
            jsonb_build_object('reason', p_reason), coalesce(auth.jwt()->>'email', 'system'));
  return d;
end $$;

revoke all on function public.billing_issue_document(uuid) from public, anon;
revoke all on function public.billing_amend_document(uuid, jsonb, bigint, text) from public, anon;
revoke all on function public.billing_set_void(uuid, boolean, text) from public, anon;
grant execute on function public.billing_issue_document(uuid) to authenticated;
grant execute on function public.billing_amend_document(uuid, jsonb, bigint, text) to authenticated;
grant execute on function public.billing_set_void(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer-facing RPCs (anon). Costs and internal notes never leave the DB.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_billing_document(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  d public.billing_documents;
  clean jsonb;
  parent_no text;
begin
  select * into d from public.billing_documents
   where share_token = p_token and lifecycle in ('issued', 'void');
  if not found then return null; end if;

  clean := (d.content - 'internal_notes');
  clean := jsonb_set(clean, '{items}', coalesce((
    select jsonb_agg(i - 'cost_pence') from jsonb_array_elements(d.content->'items') i), '[]'::jsonb));

  select number into parent_no from public.billing_documents where id = d.parent_id;

  return jsonb_build_object(
    'doc_type', d.doc_type, 'number', d.number, 'lifecycle', d.lifecycle,
    'quote_outcome', d.quote_outcome, 'revision', d.revision,
    'issued_at', d.issued_at, 'due_at', d.due_at, 'valid_until', d.valid_until,
    'content', clean, 'total_pence', d.total_pence, 'paid_pence', d.paid_pence,
    'credited_pence', d.credited_pence, 'pay_url', d.pay_url, 'parent_number', parent_no,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'document_id', p.document_id, 'amount_pence', p.amount_pence, 'method', p.method,
        'paid_at', p.paid_at, 'reference', p.reference, 'note', '', 'created_at', p.created_at)
        order by p.paid_at)
        from public.billing_payments p where p.document_id = d.id), '[]'::jsonb)
  );
end $$;

create or replace function public.billing_record_view(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d public.billing_documents;
begin
  select * into d from public.billing_documents where share_token = p_token and lifecycle in ('issued', 'void');
  if not found then return; end if;
  update public.billing_documents
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where id = d.id;
  if d.first_viewed_at is null then
    insert into public.billing_events(document_id, session_id, kind, detail, actor)
      values (d.id, d.session_id, 'viewed', '{}'::jsonb, 'customer');
  end if;
end $$;

create or replace function public.billing_respond_quote(p_token text, p_outcome text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d public.billing_documents;
begin
  if p_outcome not in ('accepted', 'declined') then raise exception 'Invalid response'; end if;
  select * into d from public.billing_documents
   where share_token = p_token and doc_type = 'quote' and lifecycle = 'issued' and quote_outcome = 'pending';
  if not found then raise exception 'This quote can no longer be changed'; end if;
  update public.billing_documents set quote_outcome = p_outcome, updated_at = now() where id = d.id;
  insert into public.billing_events(document_id, session_id, kind, detail, actor)
    values (d.id, d.session_id, 'quote_' || p_outcome, jsonb_build_object('name', left(coalesce(p_name, ''), 120)), 'customer');
end $$;

revoke all on function public.get_public_billing_document(text) from public;
revoke all on function public.billing_record_view(text) from public;
revoke all on function public.billing_respond_quote(text, text, text) from public;
grant execute on function public.get_public_billing_document(text) to anon, authenticated;
grant execute on function public.billing_record_view(text) to anon, authenticated;
grant execute on function public.billing_respond_quote(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: photos attached to documents (advisories, gallery). Public-read with
-- unguessable UUID paths — the same model as the tracker's proof-of-work photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('billing-photos', 'billing-photos', true)
  on conflict (id) do nothing;

drop policy if exists "Public read billing photos" on storage.objects;
create policy "Public read billing photos" on storage.objects for select to public
  using (bucket_id = 'billing-photos');
drop policy if exists "Authenticated manage billing photos" on storage.objects;
create policy "Authenticated manage billing photos" on storage.objects for all to authenticated
  using (bucket_id = 'billing-photos') with check (bucket_id = 'billing-photos');
