"""Syncs Google Ads campaign metrics + recommendations into Supabase for
every campaign row that has a google_ads_customer_id set.

Intended to run on a schedule via n8n (Schedule Trigger -> Execute Command).

Run: py code/sync_all_clients.py
"""

import os

from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

from supabase_client import get_supabase

load_dotenv(override=True)

MCC_CUSTOMER_ID = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
# AniyaNetworks has direct (non-MCC) access to its own account — sending a
# login-customer-id header for it hits the "not a linked child" wall found
# earlier in this project. Every other client account IS a real linked
# child of the MCC, so it needs login-customer-id set.
DIRECT_ACCESS_CUSTOMER_IDS = {os.getenv("GOOGLE_ADS_CUSTOMER_ID")}


def build_client(customer_id: str) -> GoogleAdsClient:
    config = {
        "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
        "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
        "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
        "use_proto_plus": True,
    }
    if customer_id not in DIRECT_ACCESS_CUSTOMER_IDS:
        config["login_customer_id"] = MCC_CUSTOMER_ID
    return GoogleAdsClient.load_from_dict(config)


def sync_campaign_metrics(supabase, customer_id: str, campaign_row_id: str, google_campaign_id: str):
    client = build_client(customer_id)
    ga_service = client.get_service("GoogleAdsService")

    query = f"""
        SELECT segments.date, metrics.cost_micros, metrics.conversions,
               metrics.conversions_value, metrics.impressions, metrics.clicks
        FROM campaign
        WHERE campaign.id = {google_campaign_id}
          AND segments.date DURING LAST_30_DAYS
    """
    rows = ga_service.search(customer_id=customer_id, query=query)

    upserts = []
    for row in rows:
        upserts.append({
            "campaign_id": campaign_row_id,
            "date": row.segments.date,
            "cost": row.metrics.cost_micros / 1_000_000,
            "conversions": row.metrics.conversions,
            "conversions_value": row.metrics.conversions_value,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
        })

    if upserts:
        supabase.table("campaign_metrics").upsert(upserts, on_conflict="campaign_id,date").execute()

    print(f"  metrics: {len(upserts)} day(s) synced")


def sync_recommendations(supabase, customer_id: str, campaign_row_id: str, google_campaign_id: str):
    client = build_client(customer_id)
    ga_service = client.get_service("GoogleAdsService")

    query = f"""
        SELECT recommendation.resource_name, recommendation.type,
               recommendation.campaign, recommendation.impact
        FROM recommendation
        WHERE recommendation.campaign = 'customers/{customer_id}/campaigns/{google_campaign_id}'
    """
    rows = ga_service.search(customer_id=customer_id, query=query)

    upserts = []
    for row in rows:
        rec = row.recommendation
        base = rec.impact.base_metrics
        potential = rec.impact.potential_metrics
        base_cost = base.cost_micros / 1_000_000
        potential_cost = potential.cost_micros / 1_000_000
        value_gain = potential.conversions_value - base.conversions_value
        cost_savings = base_cost - potential_cost
        dollars_recoverable = value_gain if value_gain > 0 else max(cost_savings, 0)

        upserts.append({
            "campaign_id": campaign_row_id,
            "type": rec.type_.name,
            "dollars_recoverable": dollars_recoverable,
            "resource_name": rec.resource_name,
            "status": "open",
        })

    if upserts:
        supabase.table("recommendations").upsert(upserts, on_conflict="resource_name").execute()

    print(f"  recommendations: {len(upserts)} synced")


def main():
    supabase = get_supabase()
    campaigns = (
        supabase.table("campaigns")
        .select("id, google_ads_customer_id, google_ads_campaign_resource")
        .not_.is_("google_ads_customer_id", "null")
        .execute()
        .data
    )

    print(f"Syncing {len(campaigns)} campaign(s)...")
    for c in campaigns:
        customer_id = c["google_ads_customer_id"]
        resource = c.get("google_ads_campaign_resource")
        if not resource:
            print(f"Skipping campaign {c['id']} (customer {customer_id}): no campaign built yet")
            continue

        google_campaign_id = resource.split("/campaigns/")[1]
        print(f"Campaign {c['id']} (customer {customer_id}, google id {google_campaign_id}):")
        try:
            sync_campaign_metrics(supabase, customer_id, c["id"], google_campaign_id)
            sync_recommendations(supabase, customer_id, c["id"], google_campaign_id)
        except GoogleAdsException as ex:
            for error in ex.failure.errors:
                print(f"  ERROR: {error.message}")

    print("Done.")


if __name__ == "__main__":
    main()
