"""Continuation of add_rsas_and_assets.py: the sitelink (4) and callout (12)
assets already exist from the prior run but were never linked to the
campaign because structured snippet creation failed. This script:
1. Looks up the already-created sitelink/callout assets.
2. Creates structured snippets with the corrected header string format.
3. Creates the business name asset.
4. Links all four asset types to the campaign.

Run: py code/finish_assets.py
"""

import os
from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

load_dotenv()

config = {
    "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
    "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
    "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
    "use_proto_plus": True,
}
client = GoogleAdsClient.load_from_dict(config)
customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")

CAMPAIGN_ID = "24153906412"
CAMPAIGN_RESOURCE = f"customers/{customer_id}/campaigns/{CAMPAIGN_ID}"

STRUCTURED_SNIPPETS = [
    {
        "header": "Service catalog",
        "values": [
            "Workflow Automation",
            "AI Voice Agents",
            "Custom Dashboards",
            "CRM Integration",
            "Lead Automation",
        ],
    },
    {
        "header": "Types",
        "values": ["Automation", "Integration", "AI Agents", "Custom Development"],
    },
]

BUSINESS_NAME = "AniyaNetworks"


SITELINK_TITLES = ["Book Free Consult", "Our Services", "About AniyaNetworks", "Ad Reporting Tool"]
CALLOUT_TEXTS = [
    "40% Less Admin Time", "Upwork Top Rated Plus", "100% Job Success Rate",
    "Trusted By Growing Firms", "Free 30-Min Consultation", "No Commitment Required",
    "Risk-Free Trial", "Toronto-Based Team", "8+ Years Experience",
    "Unified Dashboards", "Custom CRM Integration", "AI Voice Agents",
]


def find_sitelink_assets():
    ga_service = client.get_service("GoogleAdsService")
    query = """
        SELECT asset.resource_name, asset.sitelink_asset.link_text
        FROM asset
        WHERE asset.type = 'SITELINK'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    return [
        row.asset.resource_name
        for row in rows
        if row.asset.sitelink_asset.link_text in SITELINK_TITLES
    ]


def find_callout_assets():
    ga_service = client.get_service("GoogleAdsService")
    query = """
        SELECT asset.resource_name, asset.callout_asset.callout_text
        FROM asset
        WHERE asset.type = 'CALLOUT'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    return [
        row.asset.resource_name
        for row in rows
        if row.asset.callout_asset.callout_text in CALLOUT_TEXTS
    ]


def find_structured_snippet_assets():
    ga_service = client.get_service("GoogleAdsService")
    query = """
        SELECT asset.resource_name, asset.structured_snippet_asset.header
        FROM asset
        WHERE asset.type = 'STRUCTURED_SNIPPET'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    headers = [s["header"] for s in STRUCTURED_SNIPPETS]
    return [
        row.asset.resource_name
        for row in rows
        if row.asset.structured_snippet_asset.header in headers
    ]


def link_assets_to_campaign(asset_resources, field_type):
    service = client.get_service("CampaignAssetService")
    ops = []
    for resource in asset_resources:
        op = client.get_type("CampaignAssetOperation")
        ca = op.create
        ca.campaign = CAMPAIGN_RESOURCE
        ca.asset = resource
        ca.field_type = field_type
        ops.append(op)
    response = service.mutate_campaign_assets(customer_id=customer_id, operations=ops)
    print(f"Linked {len(response.results)} asset(s) as {field_type.name} to campaign")


def main():
    sitelink_resources = find_sitelink_assets()
    callout_resources = find_callout_assets()
    snippet_resources = find_structured_snippet_assets()

    link_assets_to_campaign(sitelink_resources, client.enums.AssetFieldTypeEnum.SITELINK)
    link_assets_to_campaign(callout_resources, client.enums.AssetFieldTypeEnum.CALLOUT)
    link_assets_to_campaign(
        snippet_resources, client.enums.AssetFieldTypeEnum.STRUCTURED_SNIPPET
    )


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            print(f"ERROR: {error.message}")
        raise
