"""Builds the "business automation agency" SKAG for AniyaNetworks.

Everything is created PAUSED. Nothing serves until you manually enable
campaign -> ad group -> each RSA in the Google Ads UI.

Prerequisite: GOOGLE_ADS_DEVELOPER_TOKEN must have Basic Access (not Test
Access) approved. Run code/test_connection.py first to confirm.

Run: py code/build_business_automation_skag.py
"""

import os
import uuid

from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

load_dotenv()

# ---------------------------------------------------------------------------
# Config — adjust before running
# ---------------------------------------------------------------------------

DAILY_BUDGET_USD = 20
FINAL_URL = "https://aniyanetworks.net"
KEYWORD = "business automation agency"
CAMPAIGN_NAME = "Business Automation Agency - Search"
COUNTRY_GEO_TARGET_CONSTANT = "geoTargetConstants/2124"  # Canada
ENGLISH_LANGUAGE_CONSTANT = "languageConstants/1000"

UNIVERSAL_NEGATIVES = [
    "jobs", "salary", "salaries", "career", "careers", "school", "schools",
    "course", "courses", "training", "apprentice", "apprenticeship",
    "certification", "diy", "how to",
]

# Business-hours schedule (Mon-Fri 9am-6pm) — this is a B2B lead-gen form,
# not an emergency/phone service, so no 24/7 overnight window.
AD_SCHEDULE = [
    ("MONDAY", 9, 0, 18, 0),
    ("TUESDAY", 9, 0, 18, 0),
    ("WEDNESDAY", 9, 0, 18, 0),
    ("THURSDAY", 9, 0, 18, 0),
    ("FRIDAY", 9, 0, 18, 0),
]

# 3 RSAs. Each shares the same 3 pinned (slot-1) keyword-variant headlines,
# then a distinct unpinned pool. Grounded in actual site content pulled from
# aniyanetworks.net — do not invent claims not present on the site.
PINNED_HEADLINES = [
    "Business Automation Agency",
    "AI Workflow Automation",
    "Automate Your Business",
]

RSA_VARIANTS = [
    {
        # Efficiency / ROI angle
        "unpinned_headlines": [
            "Cut Admin Time By 40%",
            "Automate Leads & Payments",
            "Save Hours Every Week",
            "Scale Without More Hires",
            "Unified Real-Time Dashboards",
            "Free 30-Min Consultation",
            "No Commitment Required",
            "Connect Your Existing Tools",
            "Get Your Free Quote",
        ],
        "descriptions": [
            "AI-driven workflow automation for growing businesses. Cut admin time by 40%.",
            "Automate lead follow-ups, bookings, and admin tasks so your team can focus on growth.",
            "Connect your CRM, HubSpot, GoHighLevel and more into one automated system.",
            "Free 30-minute consultation. No commitment required. Book today.",
        ],
    },
    {
        # Tech / integration angle
        "unpinned_headlines": [
            "n8n & GoHighLevel Experts",
            "Custom CRM Integrations",
            "24/7 AI Voice Agents",
            "AI Qualifies Your Leads",
            "Full-Stack Automation Systems",
            "Connect Any Business System",
            "Real-Time Data Dashboards",
            "Book A Free Strategy Call",
        ],
        "descriptions": [
            "24/7 AI voice agents qualify leads and book calls automatically.",
            "Custom automation built with Node.js, FastAPI, and your existing stack.",
            "Integrate GoHighLevel, Make.com, n8n, HubSpot and Airtable seamlessly.",
            "Free 30-minute consultation. No commitment required. Book today.",
        ],
    },
    {
        # Trust / credibility angle
        "unpinned_headlines": [
            "Upwork Top Rated Plus",
            "100% Job Success Rate",
            "100+ Workflows Automated",
            "8+ Years Automation Experience",
            "Trusted By Growing Businesses",
            "Risk-Free Free Trial",
            "Toronto-Based Automation Team",
            "Book Your Free Consult",
        ],
        "descriptions": [
            "Upwork Top Rated Plus with a 100% job success rate. 100+ workflows automated.",
            "Built by an 8+ year DevOps engineer. Trusted by growing businesses nationwide.",
            "Risk-free trial available. No commitment required to get started.",
            "Free 30-minute consultation. See how automation can save your team time.",
        ],
    },
]

# ---------------------------------------------------------------------------

config = {
    "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
    "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
    "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
    # No login_customer_id: this login has direct access to the target
    # account, not solely through the MCC hierarchy.
    "use_proto_plus": True,
}
client = GoogleAdsClient.load_from_dict(config)
customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")


def main():
    budget_resource = create_budget()
    campaign_resource = create_campaign(budget_resource)
    set_geo_and_language(campaign_resource)
    set_ad_schedule(campaign_resource)
    add_negative_keywords(campaign_resource)
    ad_group_resource = create_ad_group(campaign_resource)
    create_keyword(ad_group_resource)
    for variant in RSA_VARIANTS:
        create_rsa(ad_group_resource, variant)

    campaign_id = campaign_resource.split("/")[-1]
    print("\nALL CREATED * PAUSED")
    print(f"Campaign: {campaign_resource}")
    print(f"Review at: https://ads.google.com/aw/campaigns?campaignId={campaign_id}")


def create_budget():
    service = client.get_service("CampaignBudgetService")
    op = client.get_type("CampaignBudgetOperation")
    budget = op.create
    budget.name = f"{CAMPAIGN_NAME} Budget {uuid.uuid4().hex[:6]}"
    budget.amount_micros = DAILY_BUDGET_USD * 1_000_000
    budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    budget.explicitly_shared = False  # required for Maximize Conversions (non-portfolio)
    response = service.mutate_campaign_budgets(customer_id=customer_id, operations=[op])
    resource = response.results[0].resource_name
    print(f"* Budget: {resource}")
    return resource


def create_campaign(budget_resource):
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    campaign = op.create
    campaign.name = CAMPAIGN_NAME
    campaign.campaign_budget = budget_resource
    campaign.status = client.enums.CampaignStatusEnum.PAUSED
    campaign.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH

    campaign.network_settings.target_google_search = True
    campaign.network_settings.target_search_network = False
    campaign.network_settings.target_content_network = False
    campaign.network_settings.target_partner_search_network = False

    # Proto-plus quirk: declare the maximize_conversions oneof without
    # CopyFrom (which errors on this field).
    campaign._pb.maximize_conversions.SetInParent()

    campaign.contains_eu_political_advertising = (
        client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
    )

    response = service.mutate_campaigns(customer_id=customer_id, operations=[op])
    resource = response.results[0].resource_name
    print(f"* Campaign: {resource}")
    return resource


def set_geo_and_language(campaign_resource):
    service = client.get_service("CampaignCriterionService")
    ops = []

    # Positive: Canada, presence only (not presence-or-interest).
    op = client.get_type("CampaignCriterionOperation")
    op.create.campaign = campaign_resource
    op.create.location.geo_target_constant = COUNTRY_GEO_TARGET_CONSTANT
    ops.append(op)

    # English only.
    lang_op = client.get_type("CampaignCriterionOperation")
    lang_op.create.campaign = campaign_resource
    lang_op.create.language.language_constant = ENGLISH_LANGUAGE_CONSTANT
    ops.append(lang_op)

    service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    print("* Geo: Canada (presence only)")
    print("* Language: English")

    exclude_other_countries(campaign_resource)


def exclude_other_countries(campaign_resource):
    ga_service = client.get_service("GoogleAdsService")
    query = """
        SELECT geo_target_constant.resource_name, geo_target_constant.country_code
        FROM geo_target_constant
        WHERE geo_target_constant.target_type = 'Country'
          AND geo_target_constant.status = 'ENABLED'
    """
    rows = ga_service.search(customer_id=customer_id, query=query)

    service = client.get_service("CampaignCriterionService")
    ops = []
    for row in rows:
        if row.geo_target_constant.country_code == "CA":
            continue
        op = client.get_type("CampaignCriterionOperation")
        op.create.campaign = campaign_resource
        op.create.negative = True
        op.create.location.geo_target_constant = row.geo_target_constant.resource_name
        ops.append(op)

    # Batch in chunks of 1000 (API mutate limit safety margin).
    for i in range(0, len(ops), 1000):
        service.mutate_campaign_criteria(customer_id=customer_id, operations=ops[i:i + 1000])
    print(f"* Excluded: {len(ops)} countries (all except Canada)")


def set_ad_schedule(campaign_resource):
    service = client.get_service("CampaignCriterionService")
    ops = []
    for day, start_h, start_m, end_h, end_m in AD_SCHEDULE:
        op = client.get_type("CampaignCriterionOperation")
        crit = op.create
        crit.campaign = campaign_resource
        crit.ad_schedule.day_of_week = client.enums.DayOfWeekEnum[day]
        crit.ad_schedule.start_hour = start_h
        crit.ad_schedule.start_minute = client.enums.MinuteOfHourEnum.ZERO
        crit.ad_schedule.end_hour = end_h
        crit.ad_schedule.end_minute = client.enums.MinuteOfHourEnum.ZERO
        ops.append(op)
    service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    print(f"* Schedule: Mon-Fri 9am-6pm ({len(ops)} windows)")


def add_negative_keywords(campaign_resource):
    service = client.get_service("CampaignCriterionService")
    ops = []
    for term in UNIVERSAL_NEGATIVES:
        op = client.get_type("CampaignCriterionOperation")
        crit = op.create
        crit.campaign = campaign_resource
        crit.negative = True
        crit.keyword.text = term
        crit.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        ops.append(op)
    service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    print(f"* Negative keywords: {len(ops)} added")


def create_ad_group(campaign_resource):
    service = client.get_service("AdGroupService")
    op = client.get_type("AdGroupOperation")
    ad_group = op.create
    ad_group.name = f"{KEYWORD} - SKAG"
    ad_group.campaign = campaign_resource
    ad_group.status = client.enums.AdGroupStatusEnum.PAUSED
    ad_group.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    response = service.mutate_ad_groups(customer_id=customer_id, operations=[op])
    resource = response.results[0].resource_name
    print(f"* Ad group: {resource}")
    return resource


def create_keyword(ad_group_resource):
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    crit = op.create
    crit.ad_group = ad_group_resource
    crit.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
    crit.keyword.text = KEYWORD
    crit.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
    service.mutate_ad_group_criteria(customer_id=customer_id, operations=[op])
    print(f'* Keyword: "{KEYWORD}" (phrase match)')


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
    print(f"* RSA: {response.results[0].resource_name}")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            print(f"ERROR: {error.message}")
        raise
