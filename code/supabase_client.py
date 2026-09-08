"""Shared Supabase client for the sync/build scripts.

Uses the service_role key — these scripts run as a trusted server-side job
(invoked by n8n's Execute Command node), not in a browser, so bypassing RLS
here is intentional and safe.
"""

import os

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(override=True)


def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env")
    return create_client(url, key)
