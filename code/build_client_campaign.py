"""Builds a Search campaign in a client's Google Ads account from a
Supabase `campaigns` row, then writes the result back.

Reuses the proven sequence/quirks from build_business_automation_skag.py,
add_rsas_and_assets.py, and add_shared_negative_list.py (same project,
already debugged against this account's real API behavior), parameterized
per-client instead of hardcoded for AniyaNetworks.

Intended to be invoked by n8n (Webhook -> Execute Command) after a new
intake form submission, but can be run directly for testing:

Run: py code/build_client_campaign.py <campaign_uuid>
"""

import sys
import os
import uuid

from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

from supabase_client import get_supabase
from add_shared_negative_list import ALL_TERMS as UNIVERSAL_NEGATIVES

load_dotenv(override=True)

MCC_CUSTOMER_ID = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")

LANGUAGE_CONSTANTS = {
    "english": "languageConstants/1000",
    "french": "languageConstants/1002",
    "spanish": "languageConstants/1003",
}

AD_SCHEDULE_PRESETS = {
    "24 hours": [
        (day, 0, 0, 24, 0)
        for day in [
            "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
        ]
    ],
    "business hours (mon-fri 9am-6pm)": [
        (day, 9, 0, 18, 0) for day in ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
    ],
}


def build_client(customer_id: str) -> GoogleAdsClient:
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
        "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
        "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
        "login_customer_id": MCC_CUSTOMER_ID,
        "use_proto_plus": True,
    })


def resolve_geo_target(client, customer_id, location_name):
    service = client.get_service("GeoTargetConstantService")
    request = client.get_type("SuggestGeoTargetConstantsRequest")
    request.locale = "en"
    request.location_names.names.append(location_name)
    response = service.suggest_geo_target_constants(request=request)
    if not response.geo_target_constant_suggestions:
        raise ValueError(f"No geo target found for location: {location_name!r}")
    return response.geo_target_constant_suggestions[0].geo_target_constant.resource_name


def create_budget(client, customer_id, daily_budget_usd, campaign_name):
    service = client.get_service("CampaignBudgetService")
    op = client.get_type("CampaignBudgetOperation")
    budget = op.create
    budget.name = f"{campaign_name} Budget {uuid.uuid4().hex[:6]}"
    budget.amount_micros = int(daily_budget_usd * 1_000_000)
    budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    budget.explicitly_shared = False
    response = service.mutate_campaign_budgets(customer_id=customer_id, operations=[op])
    return response.results[0].resource_name


def create_campaign(client, customer_id, budget_resource, campaign_name, bidding_strategy):
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    campaign = op.create
    campaign.name = campaign_name
    campaign.campaign_budget = budget_resource
    campaign.status = client.enums.CampaignStatusEnum.PAUSED
    campaign.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH

    campaign.network_settings.target_google_search = True
    campaign.network_settings.target_search_network = False
    campaign.network_settings.target_content_network = False
    campaign.network_settings.target_partner_search_network = False

    strategy = bidding_strategy.strip().lower()
    if strategy == "maximize clicks":
        campaign._pb.target_spend.SetInParent()
    elif strategy == "manual cpc":
        campaign.manual_cpc.enhanced_cpc_enabled = False
    else:
        # Maximize Conversions, Target CPA (no target value collected yet
        # in the intake form -> falls back to Maximize Conversions).
        campaign._pb.maximize_conversions.SetInParent()

    campaign.contains_eu_political_advertising = (
        client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
    )
    campaign.geo_target_type_setting.positive_geo_target_type = (
        client.enums.PositiveGeoTargetTypeEnum.PRESENCE
    )

    response = service.mutate_campaigns(customer_id=customer_id, operations=[op])
    return response.results[0].resource_name


def add_geo_and_language(client, customer_id, campaign_resource, locations, languages):
    service = client.get_service("CampaignCriterionService")
    ops = []

    for location in locations:
        geo_resource = resolve_geo_target(client, customer_id, location)
        op = client.get_type("CampaignCriterionOperation")
        op.create.campaign = campaign_resource
        op.create.location.geo_target_constant = geo_resource
        ops.append(op)

    for language in languages:
        lang_resource = LANGUAGE_CONSTANTS.get(language.strip().lower(), LANGUAGE_CONSTANTS["english"])
        op = client.get_type("CampaignCriterionOperation")
        op.create.campaign = campaign_resource
        op.create.language.language_constant = lang_resource
        ops.append(op)

    if ops:
        service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)


def add_ad_schedule(client, customer_id, campaign_resource, ad_schedule_name):
    windows = AD_SCHEDULE_PRESETS.get(
        ad_schedule_name.strip().lower(), AD_SCHEDULE_PRESETS["24 hours"]
    )
    service = client.get_service("CampaignCriterionService")
    ops = []
    for day, start_h, start_m, end_h, end_m in windows:
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


def add_negative_keywords(client, customer_id, campaign_resource, list_name):
    shared_set_service = client.get_service("SharedSetService")
    op = client.get_type("SharedSetOperation")
    shared_set = op.create
    shared_set.name = f"{list_name} Negatives {uuid.uuid4().hex[:6]}"
    shared_set.type_ = client.enums.SharedSetTypeEnum.NEGATIVE_KEYWORDS
    response = shared_set_service.mutate_shared_sets(customer_id=customer_id, operations=[op])
    shared_set_resource = response.results[0].resource_name

    criterion_service = client.get_service("SharedCriterionService")
    ops = []
    for term in UNIVERSAL_NEGATIVES:
        op = client.get_type("SharedCriterionOperation")
        crit = op.create
        crit.shared_set = shared_set_resource
        crit.keyword.text = term
        crit.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        ops.append(op)
    criterion_service.mutate_shared_criteria(customer_id=customer_id, operations=ops)

    campaign_shared_set_service = client.get_service("CampaignSharedSetService")
    op = client.get_type("CampaignSharedSetOperation")
    op.create.campaign = campaign_resource
    op.create.shared_set = shared_set_resource
    campaign_shared_set_service.mutate_campaign_shared_sets(customer_id=customer_id, operations=[op])


def create_ad_group(client, customer_id, campaign_resource, primary_keyword):
    service = client.get_service("AdGroupService")
    op = client.get_type("AdGroupOperation")
    ad_group = op.create
    ad_group.name = f"{primary_keyword} - SKAG"
    ad_group.campaign = campaign_resource
    ad_group.status = client.enums.AdGroupStatusEnum.PAUSED
    ad_group.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    response = service.mutate_ad_groups(customer_id=customer_id, operations=[op])
    return response.results[0].resource_name


def create_keyword(client, customer_id, ad_group_resource, primary_keyword):
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    crit = op.create
    crit.ad_group = ad_group_resource
    crit.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
    crit.keyword.text = primary_keyword
    crit.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
    service.mutate_ad_group_criteria(customer_id=customer_id, operations=[op])


def build_placeholder_rsa_copy(business_name, primary_keyword, goal):
    """Generic, editorially-compliant starter copy — grounded only in facts
    we actually have (business name, keyword, goal). NOT business-specific
    marketing copy: refine with /generate-ads (or the AI messaging system)
    once there's real site content and trust signals to work from, same as
    was done manually for AniyaNetworks earlier in this project.
    """
    title_keyword = primary_keyword.title()
    pinned = [
        title_keyword,
        f"{business_name}",
        f"{title_keyword} Experts",
    ]
    unpinned = [
        f"Contact {business_name} Today",
        "Free Consultation Available",
        "No Commitment Required",
        "Trusted Local Service",
        "Get Started Today",
        f"{goal.title()} Made Simple",
        "Book Online Today",
        "Serving Your Area",
    ]
    descriptions = [
        f"{business_name} offers {primary_keyword}. Contact us today to get started.",
        "Free consultation, no commitment required. See how we can help.",
        "Trusted, local, and ready to help. Reach out to learn more.",
        f"Looking for {primary_keyword}? {business_name} is here to help.",
    ]
    return pinned, unpinned, descriptions


def create_rsas(client, customer_id, ad_group_resource, final_url, business_name, primary_keyword, goal):
    pinned, unpinned, descriptions = build_placeholder_rsa_copy(business_name, primary_keyword, goal)

    service = client.get_service("AdGroupAdService")
    op = client.get_type("AdGroupAdOperation")
    ad_group_ad = op.create
    ad_group_ad.ad_group = ad_group_resource
    ad_group_ad.status = client.enums.AdGroupAdStatusEnum.PAUSED

    ad = ad_group_ad.ad
    ad.final_urls.append(final_url)

    for text in pinned:
        asset = client.get_type("AdTextAsset")
        asset.text = text[:30]
        asset.pinned_field = client.enums.ServedAssetFieldTypeEnum.HEADLINE_1
        ad.responsive_search_ad.headlines.append(asset)

    for text in unpinned:
        asset = client.get_type("AdTextAsset")
        asset.text = text[:30]
        ad.responsive_search_ad.headlines.append(asset)

    for text in descriptions:
        asset = client.get_type("AdTextAsset")
        asset.text = text[:90]
        ad.responsive_search_ad.descriptions.append(asset)

    service.mutate_ad_group_ads(customer_id=customer_id, operations=[op])


def build_campaign(campaign_id: str):
    """Does the actual build. Raises on failure — callers are responsible
    for catching and recording the error (see run() below), so this stays
    reusable from both the CLI and api_server.py without duplicating that
    logic."""
    supabase = get_supabase()

    campaign_row = supabase.table("campaigns").select("*").eq("id", campaign_id).single().execute().data
    client_row = supabase.table("clients").select("*").eq("id", campaign_row["client_id"]).single().execute().data

    customer_id = campaign_row.get("google_ads_customer_id")
    if not customer_id:
        raise ValueError(
            "campaigns.google_ads_customer_id is not set — the client needs a Google Ads "
            "account already linked under the MCC before this script can run."
        )

    supabase.table("campaigns").update({"status": "building"}).eq("id", campaign_id).execute()

    client = build_client(customer_id)

    budget_resource = create_budget(
        client, customer_id, campaign_row["daily_budget_usd"], campaign_row["campaign_name"]
    )
    campaign_resource = create_campaign(
        client, customer_id, budget_resource, campaign_row["campaign_name"], campaign_row["bidding_strategy"]
    )
    add_geo_and_language(
        client, customer_id, campaign_resource,
        campaign_row["targeted_locations"], campaign_row["languages"],
    )
    add_ad_schedule(client, customer_id, campaign_resource, campaign_row["ad_schedule"])
    add_negative_keywords(client, customer_id, campaign_resource, client_row["business_name"])

    ad_group_resource = create_ad_group(client, customer_id, campaign_resource, campaign_row["primary_keyword"])
    create_keyword(client, customer_id, ad_group_resource, campaign_row["primary_keyword"])

    final_url = client_row.get("website_url") or "https://example.com"
    create_rsas(
        client, customer_id, ad_group_resource, final_url,
        client_row["business_name"], campaign_row["primary_keyword"], campaign_row["goal"],
    )

    supabase.table("campaigns").update({
        "status": "paused",
        "google_ads_campaign_resource": campaign_resource,
        "google_ads_ad_group_resource": ad_group_resource,
        "error_message": None,
    }).eq("id", campaign_id).execute()

    print(f"Campaign built: {campaign_resource}")
    print(f"Ad group: {ad_group_resource}")
    print("Status: PAUSED — review in the Google Ads UI, and refine ad copy, before enabling.")


def run(campaign_id: str):
    """Wraps build_campaign() with the shared error-handling: on failure,
    records status='error' + error_message on the campaigns row before
    re-raising. Used by both the CLI entry point and api_server.py."""
    supabase = get_supabase()
    try:
        build_campaign(campaign_id)
    except Exception as ex:
        supabase.table("campaigns").update({
            "status": "error",
            "error_message": str(ex),
        }).eq("id", campaign_id).execute()
        raise


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: py code/build_client_campaign.py <campaign_uuid>")
        sys.exit(1)

    try:
        run(sys.argv[1])
    except Exception as ex:
        print(f"ERROR: {ex}")
        raise
