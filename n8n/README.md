# n8n workflows

Four workflows, all as importable JSON in this folder.

**Architecture history, for context:** this started as n8n orchestrating +
Python (`code/`) doing the actual Google Ads talking, since that Python
code was already proven this session. That needed either n8n's Execute
Command node (disabled on your instance via `NODES_EXCLUDE`, a sensible
security default) or a separately-hosted API service (`code/api_server.py`,
still in this repo but no longer used by these workflows — you decided
against standing up separate hosting for it). **`build-campaign.json` is
now rebuilt natively in n8n** — every Google Ads API call is a direct HTTP
Request node inside the workflow itself, no external service required.
`sync-metrics.json` and `send-reply.json`'s deferred action-application
step still reference the old `api_server.py` approach and need the same
native rewrite — flag it if you want that done next.

**Important — this native version is untested.** I don't have live n8n
access, so unlike `code/build_client_campaign.py` (which I ran against
your real account and verified this session), `build-campaign.json` has
not executed even once. Expect to debug it against a real (ideally
disposable/test) client account before trusting it for real client
campaigns. `code/build_client_campaign.py` remains the proven fallback if
this doesn't work.

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
folder. All four import as separate workflows named `build-campaign`,
`sync-metrics`, `client-email-to-draft`, `send-reply`.

## One-time setup after importing

**Environment variables** (self-hosted: set in n8n's `.env` / process
environment and restart n8n; if `$env` access is blocked in your instance,
replace the affected header values with n8n Header Auth credentials
instead — this applies to `sync-metrics.json` and `send-reply.json` only;
`build-campaign.json` doesn't use `$env` at all since it hit this same
wall and was rebuilt with hardcoded values instead, see below):
- `INTERNAL_API_URL` — wherever `api_server.py` is reachable from n8n, e.g.
  `http://localhost:8000` (same host) or `http://api:8000` (sibling
  container on the same Docker network)
- `INTERNAL_API_KEY` — same value as the project's `.env`
- `SUPABASE_URL` — same value as the project's `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — same value as the project's
  `SUPABASE_SERVICE_ROLE_KEY`

No separate "from address" env var is needed for outbound replies — the
Gmail node sends from whichever account its credential is authorized for.

**Credentials** (Settings → Credentials → + Add):
- **Supabase** — used by `build-campaign.json`'s 4 Supabase-type nodes
  ("Get Google Ads credentials", "Get campaign", "Get client", "Mark
  building", "Mark paused" — that's 5, all Supabase node type). Create it
  with your project's URL + **service_role key** (not anon — these calls
  need to bypass RLS the same way the Python scripts do). After import,
  open each of those 5 nodes and select the credential (they ship with a
  placeholder credential reference that won't resolve on its own).
- **Anthropic** — used by `client-email-to-draft`'s AI Agent. After
  import, open that workflow's "Anthropic Chat Model" node and select your
  credential (the JSON ships with a placeholder credential reference that
  won't resolve on its own)
- **Gmail (OAuth2)** — your client-support Gmail account, used by both
  `client-email-to-draft`'s Gmail Trigger (reading) and `send-reply`'s
  Gmail node (sending). One credential covers both — after import, open
  each workflow's Gmail-type node and select it (the JSON ships with a
  placeholder credential reference that won't resolve on its own). n8n
  will walk you through the Google OAuth consent flow the first time you
  create this credential.

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

**Trigger:** Schedule, daily

**Not yet updated** — still calls `api_server.py`'s `/sync-metrics`, which
you decided not to host. This one hasn't been rebuilt natively yet: it
needs a loop over every campaign row (variable count, so it needs n8n's
Loop Over Items node) with a two-way branch per item depending on whether
that campaign's Google Ads account is a direct-access account (no
`login-customer-id` header — currently just AniyaNetworks) or a proper MCC
child (`login-customer-id: 1616859870`, true for every new client account
going forward). That's more moving parts than `build-campaign` had, and I
held off building it blind in the same pass — say the word and I'll do it
next. Until then, `code/sync_all_clients.py` still works standalone
(`py code/sync_all_clients.py`, run manually or on a plain OS-level cron/
Task Scheduler entry — no n8n involvement needed).

## 3. client-email-to-draft.json

**Trigger:** Gmail Trigger, polling your client-support Gmail inbox every
minute

Flow: Gmail Trigger → **Extract sender email** (Code node, pulls the bare
address out of `"Name <email>"` format) → **Look up client** (HTTP Request
to Supabase, filter by email) → **Client found?** (IF) →
- not found: Notify (No-Op placeholder) and stop
- found: **Get client's campaign** (HTTP Request) → **Insert inbound
  message** (HTTP Request, `Prefer: return=representation` so we get the
  new row's id back) → **Draft reply (AI Agent)**, fed by an **Anthropic
  Chat Model** sub-node and a **Structured Output Parser** (schema:
  `{ reply: string, proposed_action: object | null }`) → **Save draft to
  message** (HTTP Request PATCH, sets `ai_draft_body`, `proposed_action`,
  `status: "drafted"`) → Notify (No-Op placeholder) with a dashboard link

The system prompt on the AI Agent node explicitly tells it this draft will
be human-reviewed before anything sends, and not to promise or claim
anything it isn't instructed to.

**Field name caveat:** the Gmail Trigger's exact output field names
(`from`, `subject`, `text`/`snippet`) match n8n's standard shape (with
Simplify on) as of recent versions, but I couldn't verify against your
actual instance. Run one test execution after setting up the Gmail
credential and check the trigger node's output panel — adjust the
"Extract sender email" Code node if the field
names differ.

## 4. send-reply.json

**Trigger:** Webhook, path `/send-reply`, POST
**Called by:** the dashboard's "Approve & Send" button
(`site/src/components/MessageThread.tsx`), payload
`{ "message_id": "<uuid>" }`

Flow: Webhook → **Validate message_id** (same UUID-shape guard) → **Get
message** (HTTP Request) → **Has proposed_action?** (IF) →
- yes: **Apply proposed action** (HTTP Request to `api_server.py`'s
  `/apply-action`) → Send reply email
- no: straight to Send reply email

→ **Send reply email** (Gmail node) → **Mark message sent** (HTTP Request PATCH,
`status: "sent"`, `sent_at: now()`)

**`/apply-action` currently returns 501 Not Implemented.** I deliberately
held off building the real dispatch logic (`code/apply_action.py`, which
`/apply-action` would call) until we've seen a few real `proposed_action`
shapes come out of workflow 3 in practice — it should match what the AI
actually proposes, not a guess. The "has proposed_action" branch will fail
until that's built. Happy to build it as soon as you have a few real
examples, or scope a first version now if you'd rather not wait.
