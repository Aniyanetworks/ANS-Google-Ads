"""Outputs campaign metrics + recommendations as JSON for the Next.js dashboard.

Called as a subprocess from site/src/lib/googleAdsClient.ts, since the
Google Ads REST API has an unresolved auth quirk for this account's direct
(non-MCC) access pattern, while the gRPC Python client works reliably.

Run: py code/dashboard_data.py
"""

import json
import os

from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient

load_dotenv(override=True)

config = {
    "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
    "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
    "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
    "use_proto_plus": True,
}
client = GoogleAdsClient.load_from_dict(config)
customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")
ga_service = client.get_service("GoogleAdsService")


def get_campaigns():
    query = """
        SELECT campaign.id, campaign.name, campaign.status,
               metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM campaign
        WHERE segments.date DURING LAST_30_DAYS
          AND campaign.status != 'REMOVED'
        ORDER BY metrics.cost_micros DESC
    """
    campaigns = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        campaigns.append({
            "id": str(row.campaign.id),
            "name": row.campaign.name,
            "status": row.campaign.status.name,
            "costMicros": row.metrics.cost_micros,
            "conversions": row.metrics.conversions,
            "conversionsValue": row.metrics.conversions_value,
        })
    return campaigns


def get_recommendations():
    query = """
        SELECT recommendation.resource_name, recommendation.type,
               recommendation.campaign, recommendation.impact
        FROM recommendation
    """
    recs = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        rec = row.recommendation
        recs.append({
            "resourceName": rec.resource_name,
            "type": rec.type_.name,
            "campaign": rec.campaign,
            "baseCostMicros": rec.impact.base_metrics.cost_micros,
            "baseConversionsValue": rec.impact.base_metrics.conversions_value,
            "potentialCostMicros": rec.impact.potential_metrics.cost_micros,
            "potentialConversionsValue": rec.impact.potential_metrics.conversions_value,
        })
    return recs


if __name__ == "__main__":
    print(json.dumps({
        "campaigns": get_campaigns(),
        "recommendations": get_recommendations(),
    }))
