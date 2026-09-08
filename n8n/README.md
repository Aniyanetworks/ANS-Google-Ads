# n8n workflows

Four workflows, all as importable JSON in this folder. n8n's job in this
system is orchestration only — the actual Google Ads talking happens in the
already-proven Python scripts in `code/`, invoked via a small persistent
HTTP API (`code/api_server.py`) rather than n8n's Execute Command node.

**Why not Execute Command:** your n8n instance has it administratively
disabled (via `NODES_EXCLUDE`), which is a sensible security default for
self-hosted n8n exposed to the internet — Execute Command grants n8n direct
shell access to its host. `api_server.py` is the more secure alternative:
it exposes exactly the two operations n8n needs (`/build-campaign`,
`/sync-metrics`), nothing else, behind a shared-secret header. Supabase
reads/writes go through direct HTTP Request calls to Supabase's REST API
(not the built-in Supabase node — its parameter schema varies across n8n
versions and I can't verify it without live access). The AI drafting step
uses n8n's **AI Agent** node with an Anthropic Chat Model and a structured
output parser.

## Running `code/api_server.py`

This needs to run **persistently** (not per-request) somewhere n8n can
reach it over HTTP — same host as n8n, a sibling Docker container on the
same network, or any machine with a reachable address.

```bash
pip install -r code/requirements.txt
uvicorn code.api_server:app --host 0.0.0.0 --port 8000
```

Run it under a process manager so it survives restarts/crashes — systemd,
pm2, a Docker container with `restart: unless-stopped`, whatever you
already use for long-running services. It needs the project root `.env`
available (developer token, Supabase service role key,
`INTERNAL_API_KEY`).

**`INTERNAL_API_KEY`** is already generated and set in the project's root
`.env`. Every request to `api_server.py` must include it as an
`X-API-Key` header, or the request is rejected with 401. If this API is
reachable over the network (not just localhost), put it behind a reverse
proxy with TLS — the shared secret alone isn't a substitute for HTTPS.

I tested all three endpoints locally (auth rejection, UUID validation,
and a real `/sync-metrics` run against your live account) before writing
this — see the conversation for the verification output. What I could not
test is reachability from your actual n8n host, since I don't have access
to it.

## Import

In n8n: **Workflows → Import from File** → pick each `.json` in this
folder. All four import as separate workflows named `build-campaign`,
`sync-metrics`, `client-email-to-draft`, `send-reply`.

## One-time setup after importing

**Environment variables** (self-hosted: set in n8n's `.env` / process
environment and restart n8n; if `$env` access is blocked in your instance,
replace the affected header values with n8n Header Auth credentials
instead):
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

---

## 1. build-campaign.json

**Trigger:** Webhook, path `/build-campaign`, POST
**Called by:** the intake form (`site/src/pages/IntakePage.tsx`), payload
`{ "campaign_id": "<uuid>" }`

Flow: Webhook → **Validate campaign_id** (Code node, rejects anything not
UUID-shaped) → **Start campaign build** (HTTP Request to
`api_server.py`'s `/build-campaign`) → Notify (No-Op placeholder — swap
for your actual Slack/Email node).

`api_server.py` responds immediately with `{"status": "started"}` and
runs the actual build in a background thread — the campaigns row's
`status`/`error_message` (visible on the dashboard) is the real source of
truth for whether it succeeded, since a Google Ads campaign build takes
longer than a synchronous HTTP response should wait for.

## 2. sync-metrics.json

**Trigger:** Schedule, daily

Flow: Schedule Trigger → **Trigger sync** (HTTP Request to
`api_server.py`'s `/sync-metrics`). The simplest of the four.

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
