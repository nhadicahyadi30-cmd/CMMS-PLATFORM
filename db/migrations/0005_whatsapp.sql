-- 0005: integrasi WhatsApp Business Cloud API
begin;

create table wa_templates (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  name      text not null,              -- nama template yang disetujui Meta
  language  text not null default 'id',
  category  text not null check (category in ('utility','authentication','marketing')),
  event     text not null check (event in ('wo_assigned','wo_reminder','wo_escalation','pm_due','wo_approved','wo_rejected')),
  body_preview text not null,
  approved  boolean not null default false,
  unique (org_id, name, language)
);

create table wa_messages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  direction     text not null check (direction in ('out','in')),
  technician_id uuid,
  wo_id         uuid references work_orders(id) on delete set null,
  wa_message_id text,                    -- id dari Meta (idempotensi)
  from_e164     text, to_e164 text,
  msg_type      text not null default 'text' check (msg_type in ('text','template','image','document','audio','interactive','location','other')),
  template_name text,
  body          text,
  media_s3_key  text,
  status        text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','received')),
  error_code    text,
  created_at    timestamptz not null default now(),
  status_at     timestamptz,
  foreign key (org_id, technician_id) references technicians(org_id, id)
);
create unique index wa_msg_id_uq on wa_messages (org_id, wa_message_id) where wa_message_id is not null;
create index on wa_messages (wo_id, created_at);
create index on wa_messages (technician_id, created_at desc);

-- webhook mentah untuk idempotensi + audit; diproses asinkron oleh worker
create table wa_webhook_events (
  id          bigint generated always as identity primary key,
  org_id      uuid references organizations(id) on delete cascade,
  event_key   text not null unique,      -- hash payload / message id
  payload     jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error       text
);
create index on wa_webhook_events (received_at) where processed_at is null;

create table wa_escalation_rules (
  org_id   uuid not null references organizations(id) on delete cascade,
  priority text not null check (priority in ('P1','P2','P3','P4')),
  remind_after_min int not null check (remind_after_min > 0),
  escalate_after_min int not null check (escalate_after_min >= remind_after_min),
  escalate_to_role text not null default 'supervisor' check (escalate_to_role in ('supervisor','admin')),
  primary key (org_id, priority)
);

commit;
