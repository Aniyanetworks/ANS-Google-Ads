# n8n workflows

Six workflows, all as importable JSON in this folder: `build-campaign`,
`sync-metrics`, `client-message-to-draft`, `send-reply`, `campaign-chat`,
and `apply-campaign-action`.

**No email anywhere in client communication.** Clients reach the agency
through an in-app chat on a public, login-free portal page
(`site/src/pages/ClientPortalPage.tsx`, route `/client/:clientId` — the
client's UUID itself is the "magic link" token, nothing separate to
manage). The agency replies from the dashboard's Messages tab exactly as
before; approving a draft now inserts a new row back into `messages`
instead of sending a Gmail. `client-email-to-draft.json` (Gmail Trigger
based) is gone — replaced by `client-message-to-draft.json`, a webhook the
portal page calls after inserting a client's message.

**Architecture history, for context:** this started as n8n orchestrating +
Python (`code/`) doing the actual Google Ads talking, since that Python
code was already proven this session. That needed either n8n's Execute
Command node (disabled on your instance via `NODES_EXCLUDE`, a sensible
security default) or a separately-hosted API service (`code/api_server.py`,
still in this repo but no longer used by any of these workflows — you
decided against standing up separate hosting for it). **Every workflow is
now rebuilt natively in n8n**, including `sync-metrics.json` as of this
session — every Google Ads API call and every Supabase read/write is a
direct node inside the workflow itself, no external service and no `$env`
access required (both were blocked on your instance).
`code/sync_all_clients.py` remains the proven Python fallback for a manual
sync if the n8n version ever needs debugging.

**`build-campaign.json` has been tested step-by-step against your real
account this session** — every node in it, from credentials fetch through
budget/campaign/geo/negatives/ad group/keyword/RSA creation, has been run
live and fixed against real errors (wrong endpoints, the direct-access vs.
MCC-child `login-customer-id` distinction, Supabase field-shape mismatches,
etc.). `client-message-to-draft.json`, `send-reply.json`, `campaign-chat.json`,
and `apply-campaign-action.json` reuse those same proven patterns
(native Supabase nodes, the same OAuth refresh + JSON-header approach for
Google Ads calls) but have **not** all been run live yet — treat anything
below marked "untested" accordingly. `code/build_client_campaign.py`
remains the proven Python fallback for building a campaign if the n8n
version ever breaks in a way that's faster to route around than debug.

**$env is also blocked** on top of Execute Command, so hardcoded secrets
in the workflow JSON weren't an option either. Instead: Google Ads
credentials (developer token, OAuth client id/secret/refresh token, MCC
id) now live in a Supabase table (`google_ads_settings`), editable from
the dashboard's **/settings** page — `build-campaign.json`'s first real
step fetches that row and every downstream node reads from it via
expressions, no secrets sitting in the JSON. The only thing still needed
per-node is a Supabase **credential** (see below) — set once in n8n's UI,
never exported into the JSON either.

**This n8n-native Supabase approach was partially corrected against your
actual instance.** The `n8n-nodes-base.supabase` node's filter/update
`keyName`/`fieldId` fields turned out to be n8n resource-locator objects
(`{__rl: true, value, mode, cachedResultName}`, dynamically populated with
your table's real columns) rather than the plain strings I originally
guessed — this was confirmed from a screenshot of the actual error in
your n8n instance and fixed across all 4 affected nodes ("Get campaign",
"Get client", "Mark building", "Mark paused"). The rest of the Supabase
node's parameters (`operation`, `tableId`, `filterType`, `matchType`,
`condition` values like `"eq"`) are still unverified — if another one
turns out wrong, the same fix pattern applies: whatever the n8n UI shows
for that field's actual expected shape, once you fix it in the UI you can
re-export the corrected node's JSON and send it to me to apply everywhere
else it repeats.

## Import

In n8n: **Workflows → Import from File** → pick each `.json` in this
folder. All six import as separate workflows named `build-campaign`,
`sync-metrics`, `client-message-to-draft`, `send-reply`, `campaign-chat`, and
`apply-campaign-action`.

## One-time setup after importing

**Environment variables** — none needed by any of the six workflows.
`$env` access is blocked on your instance, so nothing in this folder
relies on it anymore.

**Credentials** (Settings → Credentials → + Add):
- **Supabase** — one credential, reused across every Supabase-type node in
  all six workflows (`build-campaign.json`: "Get Google Ads credentials",
  "Get campaign", "Get client", "Mark building", "Mark paused";
  `client-message-to-draft.json`: "Get message", "Get client", "Get
  campaign", "Get campaign metrics", "Get open recommendations", "Save
  draft to message"; `send-reply.json`: "Get message", "Get campaign for
  action", "Get Google Ads credentials", "Insert outbound message", "Mark
  inbound message replied"; `campaign-chat.json`: "Insert user message",
  "Get campaign", "Get campaign metrics", "Get open recommendations", "Get
  recent chat history", "Insert assistant message";
  `apply-campaign-action.json`: "Get campaign", "Get Google Ads
  credentials", "Mark chat message applied"; `sync-metrics.json`: "Get
  Google Ads credentials", "Get all campaigns", "Delete existing metrics
  row", "Create metrics row", "Get fresh recommendations", "Insert
  proactive suggestion", "Delete existing open recommendations", "Create
  recommendation row" — 33 nodes total). Create it with your project's URL
  + **service_role key** (not anon — these calls need to bypass RLS the
  same way the Python scripts do). After import, open each of those nodes
  in every workflow and select the credential (they ship with a
  placeholder credential reference that won't resolve on its own).
- **Anthropic** — used by `client-message-to-draft.json`'s,
  `campaign-chat.json`'s, and `sync-metrics.json`'s AI Agent nodes (same
  credential works for all three). After import, open each workflow's
  "Anthropic Chat Model" node and select your credential (the JSON ships
  with a placeholder credential reference that won't resolve on its own)

No Gmail credential is needed anywhere — client communication is entirely
in-app now (see the top of this file).

**`build-campaign.json`'s Google Ads OAuth values** (client id/secret,
refresh token) still need one manual step even with credentials/settings
in place: the "Refresh Google Ads token" node calls
`oauth2.googleapis.com/token` directly with an explicit HTTP Request (not
an n8n credential — see the workflow's own notes for why), and pulls its
client id/secret/refresh token from the "Get Google Ads credentials"
Supabase node's output, same as the developer token and MCC id used
throughout. Nothing to fill in manually there beyond the Supabase
credential above — update the values on the **/settings** dashboard page
instead of editing the workflow if they ever rotate.

---

## 1. build-campaign.json

**Trigger:** Webhook, path `/build-campaign`, POST
**Called by:** the intake form (`site/src/pages/IntakePage.tsx`), payload
`{ "campaign_id": "<uuid>" }`

24 nodes, fully native — no external service. Mirrors
`code/build_client_campaign.py`'s sequence exactly:

Webhook → **Validate campaign_id** (UUID guard) → **Get Google Ads
credentials** (Supabase node — reads the one row from `google_ads_settings`;
everything downstream that needs the developer token, MCC id, or OAuth
client id/secret/refresh token reads it from here) → **Get campaign** →
**Get client** (two Supabase nodes, kept separate rather than using
PostgREST's resource-embedding `select` syntax, since I wasn't confident
that syntax maps cleanly through the native Supabase node's filter UI) →
**Prepare context** (Code node, flattens/validates the row, strips any
stray dashes from the customer id, throws if no `google_ads_customer_id`)
→ **Mark building** → **Refresh Google Ads token** (explicit OAuth2
refresh call — see below for why) → **Create budget** → **Build campaign body**
(Code node — picks the right bidding oneof field for Maximize
Clicks/Conversions/Manual CPC) → **Create campaign** → **Suggest geo
targets** → **Build criteria body** (Code node — geo + language + ad
schedule, all in one `campaignCriteria:mutate` payload) → **Add
geo/language/schedule** → **Create negative list** → **Build negatives
body** (Code node — the same 149-term universal list from
`code/add_shared_negative_list.py`, ported to JS) → **Add negative
keywords** → **Attach negative list to campaign** → **Create ad group** →
**Create keyword** → **Build RSA body** (Code node — same placeholder-copy
approach as the Python version) → **Create RSA** → **Mark paused
(success)** → Notify (No-Op placeholder).

**Why an explicit token-refresh HTTP call instead of n8n's Google OAuth2
credential:** I already verified that exact `POST
https://oauth2.googleapis.com/token` refresh flow works, multiple times,
earlier this session. I have no way to configure or test n8n's OAuth2
credential UI without live access, so reusing the flow I know works is
more reliable than guessing at credential setup. The access token this
returns is used via `{{ $('Refresh Google Ads token').item.json.access_token }}`
in every downstream Google Ads node's Authorization header.

**Known simplification:** "Suggest geo targets" sends all
`targeted_locations` in one `geoTargetConstants:suggest` call (rather than
one call per location, which the Python version does for a cleaner 1:1
best match) — the following Code node takes the first suggestion per
distinct matched search term. Close to the original behavior, not
guaranteed identical. Spot-check the resulting geo criteria in the Google
Ads UI after your first real build.

**No automatic error-status rollback.** The Python version wraps the whole
build in `try/except` and writes `status='error'` + `error_message` back
to Supabase on any failure. Replicating that across ~15 chained HTTP
Request nodes would mean wiring error-output branches on every single one
— out of scope for this pass. If a build fails partway, check the n8n
execution log for which node failed, and manually reset the campaign row
in Supabase if needed (it'll be stuck on `status='building'`).

## 2. sync-metrics.json

**Trigger:** Schedule (daily; the default n8n Schedule Trigger UI fires at
midnight in the instance's timezone — adjust the node if you want a
specific hour)

21 nodes. Mirrors `code/sync_all_clients.py`'s two jobs (metrics +
recommendations) natively, plus a new third thing: a proactive AI
suggestion, posted straight into the Campaign Assistant chat.

Flow: Schedule Trigger → **Get Google Ads credentials** → **Refresh Google
Ads token** → **Get all campaigns** (native Supabase `getAll`, no filter —
`returnAll: true`, unverified for a multi-row table) → **Filter buildable
campaigns** (Code node — keeps only rows with both
`google_ads_customer_id` and `google_ads_campaign_resource` set; one
output item per valid campaign, everything downstream processes each
independently) → two parallel branches per campaign:

- **Metrics branch:** **Search campaign metrics** (`googleAds:search`,
  GAQL `segments.date DURING YESTERDAY` — deliberately scoped to a single
  day rather than a trailing window, so this stays one item per campaign
  the whole way through instead of fanning out into N day-rows, which
  would need a Merge node to safely reconverge before the proactive-AI
  step) → **Build metrics row** (falls back to a zero-valued row if Google
  returns nothing for a genuine no-spend day, keeping daily history
  gap-free) → **Delete existing metrics row** → **Create metrics row**
  (delete-then-create instead of upsert, since the native Supabase node's
  upsert support is unverified — makes re-running the same day idempotent)
  → **Get fresh recommendations** → **Build suggestion context** (Code —
  ROAS + recommendations as plain text) → **Suggest (AI Agent)**, fed by
  an **Anthropic Chat Model** and a **Structured Output Parser**
  (`should_post`, `message`, `proposed_action` — same tightened
  action schema as everywhere else) → **Prepare suggestion** → **Should
  post?** (IF) → **Insert proactive suggestion** (native Supabase
  `create`, `campaign_chat_messages`) if true, otherwise nothing.
- **Recommendations branch:** **Search recommendations** (same GAQL as
  the Python version) → **Delete existing open recommendations** for this
  campaign (clears stale ones — correct, not just idempotent: a
  recommendation Google Ads stops surfacing should stop showing as
  "open," and this never touches already-applied/dismissed rows) →
  **Build recommendation items** (one item per recommendation) → **Create
  recommendation row** (runs once per item automatically).

**The proactive suggestion is deliberately conservative.** The system
prompt tells the AI to set `should_post: false` unless something genuinely
stands out (real dollar impact, a clear performance problem, an obviously
binding budget) — the instruction is explicit that a missed suggestion is
far better than noise the agency starts ignoring. Most days, most
campaigns, should post nothing.

**Known race, accepted as a simplification:** the metrics and
recommendations branches run concurrently with no explicit
synchronization, so "Get fresh recommendations" (metrics branch) could in
rare cases read slightly-stale data if the recommendations branch hasn't
finished writing yet for that run. Low-stakes for a proactive nudge —
fixing it properly would mean a Merge node whose exact wait-for-both
semantics I haven't verified live, so it's left as a documented tradeoff
rather than guessed at.

**Untested end-to-end**, like everything built without live access this
session — the `delete` operation on the native Supabase node in particular
has never been used in any workflow before this one. `code/sync_all_clients.py`
remains a proven manual fallback (`py code/sync_all_clients.py`) if this
needs debugging.

## 3. client-message-to-draft.json

**Trigger:** Webhook, path `/client-message`, POST
**Called by:** `ClientPortalPage.tsx`, right after it inserts a client's
message via the `insert_client_message` Postgres RPC. Payload:
`{ "message_id": "<uuid>" }`

This replaces the old Gmail-Trigger-based `client-email-to-draft.json` —
same idea (AI drafts a reply for the agency to review), different trigger,
since there's no email involved anymore.

Flow: Webhook → **Validate message_id** → **Get message** (native
Supabase) → **Get client** (for `business_name` context) → **Get
campaign** (native Supabase `getAll`, limit 1, `alwaysOutputData` on — a
client with no campaign yet is a real, expected case) → **Get campaign
metrics** → **Get open recommendations** (both same pattern, grounding the
AI's suggestions in real numbers rather than generic advice) → **Build AI
context** (Code node — sums the metrics into a ROAS figure, formats
recommendations as plain text) → **Draft reply (AI Agent)**, fed by an
**Anthropic Chat Model** and a **Structured Output Parser** with the same
tightened schema used everywhere else (`proposed_action` is `null` unless
it's exactly `update_daily_budget`/`pause_campaign`/`resume_campaign`) →
**Save draft to message** (native Supabase `update` — sets `ai_draft_body`,
`proposed_action`, `status: "drafted"`, and backfills `campaign_id` on the
message row since `insert_client_message()` doesn't set it) → Notify
(No-Op placeholder) with a dashboard link.

**Unverified:** the Supabase `create`/`getAll` operation names haven't
been exercised against your live instance yet in this exact workflow (they
match the pattern proven in `build-campaign.json`, but this specific chain
hasn't run). Send a real message through the client portal once it's
wired up and tell me what breaks.

## 4. send-reply.json

**Trigger:** Webhook, path `/send-reply`, POST
**Called by:** the dashboard's "Approve & Send" button
(`site/src/components/MessageThread.tsx`), payload
`{ "message_id": "<uuid>" }`

Flow: Webhook → **Validate message_id** (same UUID-shape guard) → **Get
message** (native Supabase node) → **Has proposed_action?** (IF) →
- no: straight to Insert outbound message
- yes: **Get campaign for action** (native Supabase `get`, by
  `messages.campaign_id`) → **Get Google Ads credentials** → **Refresh
  Google Ads token (action)** → **Build campaign action body** (Code node —
  maps `proposed_action.action_type` to the right Google Ads mutate call:
  `update_daily_budget` → `campaignBudgets:mutate` update against
  `campaigns.google_ads_budget_resource`; `pause_campaign`/
  `resume_campaign` → `campaigns:mutate` update against
  `campaigns.google_ads_campaign_resource`, setting `status`) → **Apply
  campaign change** (HTTP Request — actually calls the Google Ads API,
  same `jsonHeaders`/direct-access-vs-MCC pattern as `build-campaign.json`)
  → Insert outbound message

→ **Insert outbound message** (native Supabase `create` — the approved
reply text becomes a brand new `messages` row, `direction: "outbound"`,
`channel: "in_app"`, `status: "sent"`; the client sees it on their next
portal load, no email involved) → **Mark inbound message replied** (native
Supabase `update` on the *original* inbound row, `status: "sent"`, purely
so `MessageThread.tsx` stops showing its draft-editing box for that row —
the actual reply content now lives on the new outbound row, not this one).

**The old `api_server.py`/`/apply-action` approach is gone** — replaced
with native nodes this session, matching every other Google Ads call in
this project. Real, but two things to know:
- **`google_ads_budget_resource`** is a new `campaigns` column, only
  populated by `build-campaign.json` going forward (its "Mark paused
  (success)" node now saves it). Any campaign built *before* this change
  won't have it, so `update_daily_budget` will throw a clear error for
  those until you backfill the column manually in Supabase or rebuild the
  campaign.
- **Untested end-to-end** — this chain has never actually run against a
  real `proposed_action`, since none has come out of
  `client-message-to-draft.json` yet. The individual node patterns
  (credentials fetch, token refresh, conditional `login-customer-id`, JSON
  headers) are all copied from `build-campaign.json`'s proven-working
  versions, but the full chain needs a real test — either wait for a real
  client portal message that proposes a budget/pause change, or manually
  set a `proposed_action` on a test message row and hit the webhook
  directly to exercise it.

## 5. campaign-chat.json

**Trigger:** Webhook, path `/campaign-chat`, POST
**Called by:** the dashboard's **Campaign Assistant** panel on a client's
detail page (`site/src/components/CampaignChat.tsx`), payload
`{ "campaign_id": "<uuid>", "message": "<text>" }`

This is a separate thing from `client-message-to-draft.json`/`send-reply.json`
— those are the client-facing in-app correspondence loop. This one is the
**agency chatting directly with AI about one campaign**, inside the
dashboard, with real performance data and open recommendations pulled in
as context so it can give grounded suggestions, not generic advice.

Flow: Webhook → **Validate input** (UUID + non-empty message guard) →
**Insert user message** (native Supabase `create`, `campaign_chat_messages`,
`role: "user"`) → **Get campaign** → **Get campaign metrics** (native
Supabase `getAll`, `alwaysOutputData` on — a brand-new campaign with
nothing synced yet is expected, not an error) → **Get open
recommendations** (same) → **Get recent chat history** (same, last 50
rows) → **Build AI context** (Code node — sums cost/conversions/value from
the metrics rows into a ROAS figure, formats the recommendations and last
20 chat turns as plain text) → **Chat (AI Agent)**, fed by an **Anthropic
Chat Model** and a **Structured Output Parser** with the same tightened
schema as `client-message-to-draft.json` (`proposed_action` is `null` unless
it's exactly `update_daily_budget`/`pause_campaign`/`resume_campaign`) →
**Prepare assistant message** (Code node, sets `action_status: "proposed"`
if there's a `proposed_action`, else `null`) → **Insert assistant message**
(native Supabase `create`) → **Respond to Webhook** (returns the assistant
turn as JSON — `CampaignChat.tsx` doesn't actually rely on parsing this
response though, it just reloads the full thread from Supabase after the
fetch resolves, so a mismatch here isn't fatal, just means one extra round
trip before you see the reply).

**Confirm & Apply, not auto-apply:** exactly like the client-email flow,
the AI only *proposes* an action here — the agency has to click "Confirm &
Apply" in the chat UI, which calls `apply-campaign-action.json` (below).
There is no path in this workflow that touches Google Ads directly.

**Untested end-to-end**, same caveat as everything built this session
without live access: the `create`/`getAll` Supabase operation names, the
AI Agent's structured output, and the `Respond to Webhook` field names are
all best-guess based on the patterns proven elsewhere. Run one real chat
message through it and tell me what breaks.

## 6. apply-campaign-action.json

**Trigger:** Webhook, path `/apply-campaign-action`, POST
**Called by:** the "Confirm & Apply" button in `CampaignChat.tsx`, payload
`{ "campaign_id": "<uuid>", "chat_message_id": "<uuid>", "proposed_action": {...} }`

The actual Google Ads mutation logic here is a direct copy of
`send-reply.json`'s "Build campaign action body" → "Apply campaign change"
pair — same three action types, same `google_ads_budget_resource`
dependency and caveat for older campaigns, same direct-access-vs-MCC
`login-customer-id` handling. The only difference is where the
`proposed_action` comes from (the webhook payload directly, not a
`messages` row lookup) and what gets marked afterward: **Mark chat message
applied** sets `campaign_chat_messages.action_status = "applied"` on the
originating chat row so the UI can show "✓ Applied" instead of leaving the
Confirm/Dismiss buttons showing forever.

Flow: Webhook → **Validate input** → **Get campaign** → **Get Google Ads
credentials** → **Refresh Google Ads token** → **Build campaign action
body** → **Apply campaign change** → **Mark chat message applied** →
**Respond to Webhook**.

This workflow and `send-reply.json`'s action-application branch duplicate
the same ~40 lines of mutate-building logic rather than sharing a
sub-workflow — deliberate, to keep every workflow file fully
self-contained and independently importable (no cross-workflow ID
references that would break on import into a fresh instance). If the
mutate logic ever needs a fix, it needs to be applied in both places —
`send-reply.json`'s "Build campaign action body" and this file's node of
the same name.
