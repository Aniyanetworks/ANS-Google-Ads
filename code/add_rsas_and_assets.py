"""Replaces the 3 placeholder RSAs on the Business Automation Agency campaign
with 3 spec-compliant RSAs (15 headlines / 4 descriptions each, per
anatomy-of-a-good-ad.md), and adds campaign-level sitelinks, callouts,
structured snippets, and a business name (per ad-assets-best-practices.md).

Everything is created/kept PAUSED.

Run: py code/add_rsas_and_assets.py
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
FINAL_URL = "https://aniyanetworks.net"

PINNED_HEADLINES = [
    "Business Automation Agency",
    "AI Workflow Automation",
    "Automate Your Business",
]

RSA_VARIANTS = [
    {
        "unpinned_headlines": [
            "Cut Admin Time By 40%",
            "Automate Leads And Payments",
            "Scale Without More Hires",
            "Unified Real-Time Dashboards",
            "Connect Your Existing Tools",
            "100+ Workflows Automated",
            "Upwork Top Rated Plus",
            "No Commitment Required",
            "Risk-Free Trial Available",
            "Free 30-Min Consultation",
            "Book Your Free Consult",
            "Get Started Today",
        ],
        "descriptions": [
            "Cut admin time 40% with automated leads, bookings, and payments. Book a free consult.",
            "Connect your CRM, HubSpot, and GoHighLevel into one system. No commitment required.",
            "Unified real-time dashboards. Scale without hiring more staff. Get started today.",
            "Free 30-minute consultation, no obligation. See how automation saves your team hours.",
        ],
    },
    {
        "unpinned_headlines": [
            "n8n And GoHighLevel Experts",
            "Custom CRM Integrations",
            "AI Voice Agents Qualify Leads",
            "Full-Stack Automation Systems",
            "Connect Any Business System",
            "Built With Node.js And FastAPI",
            "100+ Workflows Automated",
            "Upwork Top Rated Plus",
            "No Commitment Required",
            "Risk-Free Trial Available",
            "Free Strategy Call",
            "Book Your Free Consult",
        ],
        "descriptions": [
            "Automate leads, bookings, and admin work with AI voice agents built for your business.",
            "Custom automation built with Node.js and FastAPI, tailored to your existing tech stack.",
            "Integrate GoHighLevel, Make.com, n8n, HubSpot, and Airtable into one connected system.",
            "Free 30-minute consultation, no commitment. See what automation could save your team.",
        ],
    },
    {
        "unpinned_headlines": [
            "Upwork Top Rated Plus",
            "100% Job Success Rate",
            "100+ Workflows Automated",
            "Built By 8-Yr DevOps Engineer",
            "Trusted By Growing Businesses",
            "Toronto-Based Automation Team",
            "Cut Admin Time By 40%",
            "Unified Real-Time Dashboards",
            "No Commitment Required",
            "Risk-Free Trial Available",
            "Free 30-Min Consultation",
            "Book Your Free Consult",
        ],
        "descriptions": [
            "Upwork Top Rated Plus with a 100% job success rate. 100+ workflows automated to date.",
            "Built by an 8-plus year DevOps engineer. Trusted by growing businesses across Canada.",
            "Toronto-based automation team serving businesses nationwide. Risk-free trial available.",
            "Free 30-minute consultation, no commitment required. See how automation can help you.",
        ],
    },
]

SITELINKS = [
    {
        "title": "Book Free Consult",
        "desc1": "30-min free consultation",
        "desc2": "No commitment required",
        "url": "https://zcal.co/aniyanetworks/30min",
    },
    {
        "title": "Our Services",
        "desc1": "Workflow, AI and CRM automation",
        "desc2": "See what we automate",
        "url": "https://aniyanetworks.net/services/",
    },
    {
        "title": "About AniyaNetworks",
        "desc1": "8+ yr DevOps engineer founder",
        "desc2": "Toronto-based automation team",
        "url": "https://aniyanetworks.net/about-us/",
    },
    {
        "title": "Ad Reporting Tool",
        "desc1": "Live automation tool demo",
        "desc2": "See our work in action",
        "url": "https://aniyanetworks.net/ad-reporting-tool/",
    },
]

CALLOUTS = [
    "40% Less Admin Time",
    "Upwork Top Rated Plus",
    "100% Job Success Rate",
    "Trusted By Growing Firms",
    "Free 30-Min Consultation",
    "No Commitment Required",
    "Risk-Free Trial",
    "Toronto-Based Team",
    "8+ Years Experience",
    "Unified Dashboards",
    "Custom CRM Integration",
    "AI Voice Agents",
]

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


def main():
    ad_group_resource = get_ad_group_resource()
    remove_existing_rsas(ad_group_resource)
    for variant in RSA_VARIANTS:
        create_rsa(ad_group_resource, variant)

    sitelink_resources = create_sitelink_assets()
    callout_resources = create_callout_assets()
    snippet_resources = create_structured_snippet_assets()

    link_assets_to_campaign(sitelink_resources, client.enums.AssetFieldTypeEnum.SITELINK)
    link_assets_to_campaign(callout_resources, client.enums.AssetFieldTypeEnum.CALLOUT)
    link_assets_to_campaign(
        snippet_resources, client.enums.AssetFieldTypeEnum.STRUCTURED_SNIPPET
    )

    print("\nDone. All RSAs PAUSED, all assets attached at campaign level.")


def get_ad_group_resource():
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group.resource_name
        FROM ad_group
        WHERE ad_group.campaign = '{CAMPAIGN_RESOURCE}'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    return rows[0].ad_group.resource_name


def remove_existing_rsas(ad_group_resource):
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group_ad.resource_name
        FROM ad_group_ad
        WHERE ad_group_ad.ad_group = '{ad_group_resource}'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    if not rows:
        return
    service = client.get_service("AdGroupAdService")
    ops = []
    for row in rows:
        op = client.get_type("AdGroupAdOperation")
        op.remove = row.ad_group_ad.resource_name
        ops.append(op)
    service.mutate_ad_group_ads(customer_id=customer_id, operations=ops)
    print(f"Removed {len(ops)} old RSA(s)")


def create_rsa(ad_group_resource, variant):
    service = client.get_service("AdGroupAdService")
    op = client.get_type("AdGroupAdOperation")
    ad_group_ad = op.create
    ad_group_ad.ad_group = ad_group_resource
    ad_group_ad.status = client.enums.AdGroupAdStatusEnum.PAUSED

    ad = ad_group_ad.ad
    ad.final_urls.append(FINAL_URL)

    for text in PINNED_HEADLINES:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        asset.pinned_field = client.enums.ServedAssetFieldTypeEnum.HEADLINE_1
        ad.responsive_search_ad.headlines.append(asset)

    for text in variant["unpinned_headlines"]:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        ad.responsive_search_ad.headlines.append(asset)

    for text in variant["descriptions"]:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        ad.responsive_search_ad.descriptions.append(asset)

    response = service.mutate_ad_group_ads(customer_id=customer_id, operations=[op])
    print(f"RSA created: {response.results[0].resource_name}")


def create_sitelink_assets():
    service = client.get_service("AssetService")
    ops = []
    for sl in SITELINKS:
        op = client.get_type("AssetOperation")
        asset = op.create
        asset.sitelink_asset.link_text = sl["title"]
        asset.sitelink_asset.description1 = sl["desc1"]
        asset.sitelink_asset.description2 = sl["desc2"]
        asset.final_urls.append(sl["url"])
        ops.append(op)
    response = service.mutate_assets(customer_id=customer_id, operations=ops)
    resources = [r.resource_name for r in response.results]
    print(f"Sitelink assets created: {len(resources)}")
    return resources


def create_callout_assets():
    service = client.get_service("AssetService")
    ops = []
    for text in CALLOUTS:
        op = client.get_type("AssetOperation")
        asset = op.create
        asset.callout_asset.callout_text = text
        ops.append(op)
    response = service.mutate_assets(customer_id=customer_id, operations=ops)
    resources = [r.resource_name for r in response.results]
    print(f"Callout assets created: {len(resources)}")
    return resources


def create_structured_snippet_assets():
    service = client.get_service("AssetService")
    ops = []
    for snippet in STRUCTURED_SNIPPETS:
        op = client.get_type("AssetOperation")
        asset = op.create
        asset.structured_snippet_asset.header = snippet["header"]
        asset.structured_snippet_asset.values.extend(snippet["values"])
        ops.append(op)
    response = service.mutate_assets(customer_id=customer_id, operations=ops)
    resources = [r.resource_name for r in response.results]
    print(f"Structured snippet assets created: {len(resources)}")
    return resources


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
    service.mutate_campaign_assets(customer_id=customer_id, operations=ops)
    print(f"Linked {len(ops)} asset(s) as {field_type.name} to campaign")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            print(f"ERROR: {error.message}")
        raise
