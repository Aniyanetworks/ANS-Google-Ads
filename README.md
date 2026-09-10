# Multi-Client Google Ads Agency Automation Platform

**Stack:** React + Vite SPA (TypeScript, Tailwind) + Supabase (Postgres, Auth, RLS) + n8n (self-hosted). Google Ads REST API v25 called directly from n8n HTTP nodes (no SDK).

**Critical constraint:** the n8n instance has **Execute Command and `$env` both disabled** — all Google Ads API logic must be native n8n HTTP/Code/Supabase nodes, not shelled-out scripts.

## 1. Supabase schema

```
clients
  id uuid pk, name, email unique, business_name, website_url, phone,
  google_ads_customer_id text  -- the account this client is linked to under the MCC;
                                -- lives here (not just per-campaign) so it's known before
                                -- any campaign exists
  created_at

campaigns
  id uuid pk, client_id fk -> clients (cascade delete),
  google_ads_customer_id, campaign_name,
  primary_keyword, goal          -- nullable: intake-form concepts, don't apply to
                                  -- discovered campaigns nobody built through this app
  campaign_type default 'Search', daily_budget_usd, bidding_strategy default 'Maximize Clicks',
  languages text[] default {English}, targeted_locations text[], ad_schedule default '24 Hours',
  status check in (pending, building, active, paused, error),
  google_ads_campaign_resource, google_ads_ad_group_resource, google_ads_budget_resource,
  error_message, created_at, updated_at (trigger-maintained)
  UNIQUE INDEX on google_ads_campaign_resource WHERE not null  -- prevents duplicate-insert
                                                                 -- races from concurrent syncs

campaign_metrics
  id, campaign_id fk cascade, date, cost, conversions, conversions_value, impressions, clicks
  unique(campaign_id, date)

recommendations
  id, campaign_id fk cascade, type, dollars_recoverable, resource_name unique,
  status check in (open, applied, dismissed), synced_at

messages   -- client <-> agency in-app correspondence (NOT email)
  id, client_id fk cascade, campaign_id fk set-null (nullable — client may not specify),
  direction check in (inbound, outbound), channel default 'email' (but portal uses 'in_app'),
  from_email, subject, body, ai_draft_body, proposed_action jsonb,
  status check in (new, drafted, approved, sent, dismissed), created_at, sent_at

campaign_chat_messages  -- agency-facing AI assistant, distinct from `messages`
  id, campaign_id fk, role (user/assistant), content, proposed_action jsonb,
  action_status (proposed/applied/dismissed), created_at

google_ads_settings  -- singleton row: client_id, client_secret, refresh_token,
                      -- developer_token, mcc_customer_id
```

RLS: `anon` can only insert clients/campaigns (public intake) and call two SECURITY DEFINER functions for the client portal. `authenticated` (agency) can read/update/delete everything. Never expose the `service_role` key to the browser or via webhook — this was explicitly refused multiple times and stays refused.

**Client portal functions** (SECURITY DEFINER, magic-link access via `/client/:clientId` — the client's own UUID is the unguessable token, no login):
- `get_client_portal_data(p_client_id)` — returns business_name + message thread, each message joined with `campaign_id`/`campaign_name`
- `get_client_campaigns(p_client_id)` — feeds a campaign picker, shown only when the client has 2+ campaigns
- `insert_client_message(p_client_id, p_body, p_campaign_id default null)` — validates the campaign belongs to the client if provided

## 2. Frontend routes (React Router)

- `/login` — Supabase Auth, single agency admin
- `/intake` — public standalone intake page (client-only, no campaign fields)
- `/client/:clientId` — magic-link client portal (campaign picker when 2+ campaigns, tags each message)
- `/dashboard` — client list: Campaigns count, Customer ID, Status, Cost, Conv. Value, ROAS, Edit/Delete. Header has Settings/Account/Sync Now/Logout/+New Client
- `/dashboard/clients/:clientId` — client detail: Campaigns table (name links to detail, Delete per row), Copy portal link / Client Suggestions / Edit Client buttons, + Add Campaign
- `/dashboard/clients/:clientId/campaigns/:campaignId` — campaign detail: stat cards, Recommendations tab (scoped to this campaign), Campaign Assistant tab (AI chat, no selector needed — already scoped)
- `/dashboard/clients/:clientId/messages` — client's message thread (agency-facing, reached via button not a tab)
- `/account`, `/settings`

**Key components:** `IntakeForm` (branches on `existingClient` prop — new-client mode has no campaign fields; existing-client mode is campaign-only, prefills Google Ads Account ID from the client), `EditClientModal`, `CampaignChat` (reset/delete/confirm-apply/dismiss), `MessageThread` (approve & send AI drafts, shows campaign tag).

## 3. n8n workflows

1. **build-campaign** — webhook → reads a `campaigns` row → builds budget → campaign → geo/language/schedule → negative list → ad group → keyword → RSAs via chained HTTP nodes against Google Ads REST, writes resource IDs back
2. **sync-metrics** (the big one, 36 nodes) — `Schedule Trigger` (daily 6am) + `Sync Now Webhook`, both feeding: (a) existing-campaign metrics/recommendations/config sync, (b) campaign discovery for already-known customers, (c) whole-account discovery under the MCC, (d) discovery for clients with a `google_ads_customer_id` set but zero campaigns yet. See gotchas below — this workflow is where nearly every n8n execution-model bug surfaced.
3. **campaign-chat** / **apply-campaign-action** — agency-facing AI assistant, applies budget/pause/resume changes and writes back to Supabase
4. **client-message-to-draft** — client portal message → AI drafts a reply grounded in the campaign the client actually selected (not guessed)
5. **send-reply** — approved draft → applies any proposed action → marks sent

## 4. n8n gotchas to build in correctly from day one (each cost a debugging round here)

- **Code nodes default to "Run Once for All Items"** (process everything in one execution) — but **native nodes (HTTP/Supabase/IF) run once per input item** by default. Mixing these without realizing it silently drops all but the first item.
- **`alwaysOutputData: true`** is required on any Supabase getAll/delete that can legitimately return zero rows (first-run, empty table) — otherwise n8n halts the whole workflow with "no output data."
- **Nodes that don't need per-item context should get `executeOnce: true`** — otherwise a node fed by N items (e.g. one per campaign) redundantly re-runs N times, producing N× duplicated output downstream.
- **`.item` (implicit pairedItem lookup) breaks** once a Code node manufactures brand-new JSON objects (via `.map()`/`.push()`) rather than passing through — n8n loses the paired-item chain. Use `.first()` for singleton upstream nodes, or `.all()[$itemIndex]` / explicit-key matching for multi-item ones. This bites hardest once real data volume exceeds 1 item — write it correctly from the start rather than discovering it live.
- **Multiple upstream branches merging into one node** concatenate items, but the **merge order is not guaranteed** to match however you reconstruct it downstream — match results back to their source by a real key extracted from the response (e.g. customer ID parsed out of a resource name), never by array index.
- **Add a DB-level unique constraint** wherever "don't insert if it already exists" logic exists in n8n — in-memory dedup checks are just a snapshot; concurrent executions (e.g. an auto-fired sync racing a manual one) can both pass the same check and both insert.
- **A `google_ads_customer_id` shared by more than one client is genuinely ambiguous** — skip discovery for it rather than guessing which client owns a newly found campaign. Apply this guard everywhere a discovery branch groups by customer ID.
- **Google Ads REST quirks:** proto3 JSON omits empty/repeated fields entirely; a manager account needs an **empty** `login-customer-id` header for direct-access (non-child) accounts, and the header must be **omitted**, not sent empty; not every `recommendation.type` populates `impact.baseMetrics`/`potentialMetrics` — default to zero rather than assuming presence.

## 5. Security/process rules

- Never expose `service_role` to the browser or a webhook, no matter how it's framed.
- Every schema change to an *existing* Supabase table needs `alter table` (not `create table if not exists`, which no-ops); a changed function *return type* needs `drop function` before `create or replace`.
- Only commit when explicitly asked.
