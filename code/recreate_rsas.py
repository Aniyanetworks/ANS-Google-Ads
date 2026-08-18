"""Removes and rebuilds the 3 RSAs on the Business Automation Agency ad group
with the same content as before. Does not touch campaign-level assets.

Run: py code/recreate_rsas.py
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
          AND ad_group_ad.status != 'REMOVED'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    if not rows:
        print("No existing RSAs to remove")
        return
    service = client.get_service("AdGroupAdService")
    ops = []
    for row in rows:
        op = client.get_type("AdGroupAdOperation")
        op.remove = row.ad_group_ad.resource_name
        ops.append(op)
    service.mutate_ad_group_ads(customer_id=customer_id, operations=ops)
    print(f"Removed {len(ops)} RSA(s)")


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


def main():
    ad_group_resource = get_ad_group_resource()
    remove_existing_rsas(ad_group_resource)
    for variant in RSA_VARIANTS:
        create_rsa(ad_group_resource, variant)
    print("\nDone. 3 RSAs rebuilt, PAUSED.")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            print(f"ERROR: {error.message}")
        raise
