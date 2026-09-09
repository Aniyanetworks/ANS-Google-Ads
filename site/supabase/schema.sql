-- Multi-client campaign intake + automation system schema.
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- The frontend is a plain React SPA with no server of its own, so it talks
-- to Supabase directly with the anon key — RLS policies below are the only
-- thing protecting this data, not application code. Two trust levels:
--   - anon (public, unauthenticated): can ONLY insert into clients/campaigns
--     (the public intake form). No read access at all — an anonymous
--     visitor can submit a new campaign but can't see anyone else's data.
--   - authenticated (the single agency-owner login): full read, and update
--     access needed for reviewing/approving AI-drafted messages and
--     dismissing recommendations.
-- The n8n workflows and Python scripts (build_client_campaign.py,
-- sync_all_clients.py, apply_action.py) run outside the browser as a
-- trusted service and use the service_role key, which bypasses RLS
-- entirely — that's how metrics/recommendations/AI drafts get written even
-- though there's no "write" policy for those below.

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  business_name text not null,
  website_url text,
  phone text,
  -- The Google Ads account this client is linked to under our MCC. Lives
  -- here (not just on campaigns.google_ads_customer_id) so it's known
  -- before the client has any campaigns at all, and so "+ Add Campaign"
  -- can prefill it without needing an existing campaign row to read it
  -- from.
  google_ads_customer_id text,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  google_ads_customer_id text,
  campaign_name text not null,
  -- primary_keyword/goal are intake-form concepts; nullable because
  -- sync-metrics.json's campaign-discovery step also inserts rows for
  -- campaigns that exist in Google Ads but were never built through this
  -- app's intake flow, where neither concept applies.
  primary_keyword text,
  goal text,
  campaign_type text not null default 'Search',
  daily_budget_usd numeric not null,
  bidding_strategy text not null default 'Maximize Clicks',
  languages text[] not null default array['English'],
  targeted_locations text[] not null default '{}',
  ad_schedule text not null default '24 Hours',
  status text not null default 'pending'
    check (status in ('pending', 'building', 'active', 'paused', 'error')),
  google_ads_campaign_resource text,
  google_ads_ad_group_resource text,
  google_ads_budget_resource text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_client_id_idx on campaigns(client_id);

create table if not exists campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  date date not null,
  cost numeric not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  synced_at timestamptz not null default now(),
  unique (campaign_id, date)
);

create index if not exists campaign_metrics_campaign_id_idx on campaign_metrics(campaign_id);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type text not null,
  dollars_recoverable numeric not null default 0,
  resource_name text not null unique,
  status text not null default 'open'
    check (status in ('open', 'applied', 'dismissed')),
  synced_at timestamptz not null default now()
);

create index if not exists recommendations_campaign_id_idx on recommendations(campaign_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'email',
  from_email text,
  subject text,
  body text not null,
  ai_draft_body text,
  proposed_action jsonb,
  status text not null default 'new'
    check (status in ('new', 'drafted', 'approved', 'sent', 'dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists messages_client_id_idx on messages(client_id);

-- Client portal access: no client login. A client reaches their message
-- thread via an unguessable magic link (/client/<client_id> — the
-- client_id UUID itself is the "token", nothing separate to manage). The
-- portal page talks to Supabase with the anon key but never touches
-- `messages`/`clients` directly with a broad RLS policy — instead it calls
-- these two SECURITY DEFINER functions, which internally bypass RLS but
-- only ever act on the exact client_id passed in as an argument. That
-- keeps the anon key from being able to enumerate or read any other
-- client's data, without needing real auth.
create or replace function get_client_portal_data(p_client_id uuid)
returns table (
  business_name text,
  message_id uuid,
  direction text,
  body text,
  status text,
  created_at timestamptz,
  campaign_id uuid,
  campaign_name text
)
language sql
security definer
set search_path = public
as $$
  select c.business_name, m.id, m.direction, m.body, m.status, m.created_at,
         cam.id, cam.campaign_name
  from clients c
  left join messages m on m.client_id = c.id
  left join campaigns cam on cam.id = m.campaign_id
  where c.id = p_client_id
  order by m.created_at asc;
$$;

-- Feeds the campaign picker in the portal (only shown when a client has
-- more than one campaign, so they can say which one a message is about —
-- otherwise the AI draft workflow has no way to know which of the client's
-- campaigns an inbound message refers to).
create or replace function get_client_campaigns(p_client_id uuid)
returns table (id uuid, campaign_name text)
language sql
security definer
set search_path = public
as $$
  select id, campaign_name
  from campaigns
  where client_id = p_client_id
  order by created_at asc;
$$;

create or replace function insert_client_message(p_client_id uuid, p_body text, p_campaign_id uuid default null)
returns messages
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row messages;
begin
  if not exists (select 1 from clients where id = p_client_id) then
    raise exception 'invalid client';
  end if;
  if p_body is null or trim(p_body) = '' then
    raise exception 'empty message';
  end if;
  if p_campaign_id is not null and not exists (
    select 1 from campaigns where id = p_campaign_id and client_id = p_client_id
  ) then
    raise exception 'campaign does not belong to this client';
  end if;
  insert into messages (client_id, campaign_id, direction, channel, body, status)
  values (p_client_id, p_campaign_id, 'inbound', 'in_app', trim(p_body), 'new')
  returning * into new_row;
  return new_row;
end;
$$;

grant execute on function get_client_portal_data(uuid) to anon;
grant execute on function get_client_campaigns(uuid) to anon;
grant execute on function insert_client_message(uuid, text, uuid) to anon;

-- Agency <-> AI chat for managing a campaign directly (distinct from
-- `messages`, which is now client in-app correspondence, not email). The
-- agency asks
-- questions or requests changes; the AI can reply with a suggestion and/or
-- a proposed_action (same shape as messages.proposed_action: action_type
-- one of update_daily_budget/pause_campaign/resume_campaign, plus
-- daily_budget_usd and reason). action_status tracks whether a proposed
-- action was applied or dismissed. No anon access at all — agency-only.
create table if not exists campaign_chat_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  proposed_action jsonb,
  action_status text check (action_status in ('proposed', 'applied', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists campaign_chat_messages_campaign_id_idx on campaign_chat_messages(campaign_id);

-- Single-row config table for the account-wide Google Ads API credentials
-- (developer token, OAuth client id/secret/refresh token, MCC customer
-- id). These used to be hardcoded directly into n8n workflow JSON files,
-- which is awkward to rotate and puts secrets in plain text in version
-- control. Now n8n fetches this row at the start of each workflow run
-- instead. NOT per-client — campaigns.google_ads_customer_id already
-- holds each client's own account id.
create table if not exists google_ads_settings (
  id uuid primary key default gen_random_uuid(),
  developer_token text not null,
  client_id text not null,
  client_secret text not null,
  refresh_token text not null,
  mcc_customer_id text not null,
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at_google_ads_settings()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists google_ads_settings_set_updated_at on google_ads_settings;
create trigger google_ads_settings_set_updated_at
  before update on google_ads_settings
  for each row execute function set_updated_at_google_ads_settings();

alter table clients enable row level security;
alter table campaigns enable row level security;
alter table campaign_metrics enable row level security;
alter table recommendations enable row level security;
alter table messages enable row level security;
alter table google_ads_settings enable row level security;
alter table campaign_chat_messages enable row level security;

-- clients: anyone can create via the intake form — anon when submitted
-- from the public /intake page, authenticated when the agency submits it
-- from the dashboard's popup (a logged-in session uses the authenticated
-- role, not anon, even though the person is the same "public-facing"
-- submitter in both cases). Only the agency can read/update.
create policy "anon can insert clients" on clients
  for insert to anon with check (true);
create policy "authenticated can insert clients" on clients
  for insert to authenticated with check (true);
create policy "authenticated can read clients" on clients
  for select to authenticated using (true);
create policy "authenticated can update clients" on clients
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete clients" on clients
  for delete to authenticated using (true);

-- campaigns: same shape as clients above.
create policy "anon can insert campaigns" on campaigns
  for insert to anon with check (true);
create policy "authenticated can insert campaigns" on campaigns
  for insert to authenticated with check (true);
create policy "authenticated can read campaigns" on campaigns
  for select to authenticated using (true);
create policy "authenticated can update campaigns" on campaigns
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete campaigns" on campaigns
  for delete to authenticated using (true);

-- campaign_metrics / recommendations: written only by the service_role key
-- (n8n/Python sync jobs), read-only for the agency in the browser.
create policy "authenticated can read campaign_metrics" on campaign_metrics
  for select to authenticated using (true);
create policy "authenticated can read recommendations" on recommendations
  for select to authenticated using (true);
create policy "authenticated can update recommendations" on recommendations
  for update to authenticated using (true) with check (true);

-- messages: no anon access at all (clients never touch this table directly
-- — n8n inserts inbound messages + AI drafts with the service_role key).
-- The agency can read everything and update a message when editing/
-- approving an AI draft before it's sent.
create policy "authenticated can read messages" on messages
  for select to authenticated using (true);
create policy "authenticated can insert messages" on messages
  for insert to authenticated with check (true);
create policy "authenticated can update messages" on messages
  for update to authenticated using (true) with check (true);

-- google_ads_settings: agency-only read/update from the dashboard's
-- settings page. No insert/delete policy — the single row is seeded once
-- via the service_role key and only ever updated after that. n8n reads
-- this via its own Supabase credential (service_role), which bypasses RLS
-- entirely, so no policy is needed for that access path.
create policy "authenticated can read google_ads_settings" on google_ads_settings
  for select to authenticated using (true);
create policy "authenticated can update google_ads_settings" on google_ads_settings
  for update to authenticated using (true) with check (true);

-- campaign_chat_messages: agency-only, no anon access at all.
create policy "authenticated can read campaign_chat_messages" on campaign_chat_messages
  for select to authenticated using (true);
create policy "authenticated can insert campaign_chat_messages" on campaign_chat_messages
  for insert to authenticated with check (true);
create policy "authenticated can update campaign_chat_messages" on campaign_chat_messages
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete campaign_chat_messages" on campaign_chat_messages
  for delete to authenticated using (true);

-- Keep campaigns.updated_at current on every update.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- Seed: AniyaNetworks itself, so it shows up in the unified dashboard
-- instead of living only in the old single-account Python-subprocess view.
insert into clients (name, email, business_name, website_url)
values ('AniyaNetworks', 'manam.parves@gmail.com', 'AniyaNetworks', 'https://aniyanetworks.net')
on conflict (email) do nothing;

insert into campaigns (
  client_id, google_ads_customer_id, campaign_name, primary_keyword, goal, campaign_type,
  daily_budget_usd, bidding_strategy, languages, targeted_locations, ad_schedule,
  status, google_ads_campaign_resource, google_ads_ad_group_resource
)
select
  c.id, '3534195221', 'Business Automation Agency - Search', 'business automation agency', 'Leads', 'Search',
  1, 'Maximize Conversions', array['English'], array['Toronto, ON (50km radius)'], 'Mon-Fri 9am-6pm',
  'paused',
  'customers/3534195221/campaigns/24153906412',
  'customers/3534195221/adGroups/202407486627'
from clients c
where c.email = 'manam.parves@gmail.com'
  and not exists (
    select 1 from campaigns
    where google_ads_campaign_resource = 'customers/3534195221/campaigns/24153906412'
  );
