"""Small persistent HTTP API wrapping the Google Ads scripts, so n8n can
call them over plain HTTP instead of needing shell/Execute Command access
to this host. Scoped to exactly the operations the n8n workflows need —
this is the security upgrade over Execute Command: n8n can trigger "build
this specific campaign" or "sync metrics," never an arbitrary command.

Run persistently (not per-request) — e.g. behind systemd or pm2:
    uvicorn code.api_server:app --host 0.0.0.0 --port 8000

All endpoints require the header `X-API-Key: <INTERNAL_API_KEY>`, checked
against the INTERNAL_API_KEY env var (add it to the project root .env).
Run this behind a reverse proxy with TLS if it's reachable over the
network — this shared secret is not a substitute for HTTPS.
"""

import os
import re
from threading import Thread

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

load_dotenv(override=True)

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

app = FastAPI(title="Google Ads automation API")


def require_api_key(x_api_key: str | None):
    if not INTERNAL_API_KEY:
        raise HTTPException(500, "INTERNAL_API_KEY is not configured on the server.")
    if x_api_key != INTERNAL_API_KEY:
        raise HTTPException(401, "Invalid or missing X-API-Key header.")


class BuildCampaignRequest(BaseModel):
    campaign_id: str


@app.post("/build-campaign")
def build_campaign_endpoint(
    body: BuildCampaignRequest, x_api_key: str | None = Header(default=None)
):
    require_api_key(x_api_key)
    if not UUID_RE.match(body.campaign_id):
        raise HTTPException(400, "campaign_id is not a valid UUID.")

    # Google Ads campaign builds take a while — respond immediately and run
    # in the background, same as the webhook -> Execute Command pattern did.
    # The campaigns row's status is the source of truth for progress.
    from build_client_campaign import run as run_build

    Thread(target=run_build, args=(body.campaign_id,), daemon=True).start()
    return {"status": "started", "campaign_id": body.campaign_id}


@app.post("/sync-metrics")
def sync_metrics_endpoint(x_api_key: str | None = Header(default=None)):
    require_api_key(x_api_key)

    from sync_all_clients import main as run_sync

    Thread(target=run_sync, daemon=True).start()
    return {"status": "started"}


class ApplyActionRequest(BaseModel):
    message_id: str


@app.post("/apply-action")
def apply_action_endpoint(
    body: ApplyActionRequest, x_api_key: str | None = Header(default=None)
):
    require_api_key(x_api_key)
    if not UUID_RE.match(body.message_id):
        raise HTTPException(400, "message_id is not a valid UUID.")

    # Deliberately not implemented yet — see n8n/README.md. Once
    # code/apply_action.py exists (dispatching a proposed_action JSON to
    # the right Google Ads mutation), wire it in here the same way
    # build_client_campaign.run is wired into /build-campaign above.
    raise HTTPException(501, "apply-action is not implemented yet.")


@app.get("/health")
def health():
    return {"status": "ok"}
