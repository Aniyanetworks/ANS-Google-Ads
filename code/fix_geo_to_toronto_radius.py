"""One-off fix for campaign 24153906412:
1. Sets geo_target_type_setting to PRESENCE only (was defaulting to
   Presence-or-interest since the build script didn't set it explicitly).
2. Replaces the country-wide Canada location criterion with a 50km
   proximity radius around Downtown Toronto.

Run: py code/fix_geo_to_toronto_radius.py
"""

import os
from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient
from google.api_core import protobuf_helpers

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

# Downtown Toronto coordinates.
LATITUDE = 43.6532
LONGITUDE = -79.3832
RADIUS_KM = 50


def fix_presence_only():
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    campaign = op.update
    campaign.resource_name = CAMPAIGN_RESOURCE
    campaign.geo_target_type_setting.positive_geo_target_type = (
        client.enums.PositiveGeoTargetTypeEnum.PRESENCE
    )
    op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, campaign._pb))
    service.mutate_campaigns(customer_id=customer_id, operations=[op])
    print("Fixed: geo_target_type_setting = PRESENCE")


def swap_to_toronto_radius():
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT campaign_criterion.resource_name, campaign_criterion.type
        FROM campaign_criterion
        WHERE campaign_criterion.campaign = '{CAMPAIGN_RESOURCE}'
          AND campaign_criterion.negative = false
          AND campaign_criterion.type = 'LOCATION'
    """
    rows = ga_service.search(customer_id=customer_id, query=query)
    old_location_resources = [row.campaign_criterion.resource_name for row in rows]

    service = client.get_service("CampaignCriterionService")
    ops = []

    for resource in old_location_resources:
        op = client.get_type("CampaignCriterionOperation")
        op.remove = resource
        ops.append(op)

    add_op = client.get_type("CampaignCriterionOperation")
    crit = add_op.create
    crit.campaign = CAMPAIGN_RESOURCE
    crit.proximity.radius = RADIUS_KM
    crit.proximity.radius_units = client.enums.ProximityRadiusUnitsEnum.KILOMETERS
    crit.proximity.geo_point.latitude_in_micro_degrees = int(LATITUDE * 1_000_000)
    crit.proximity.geo_point.longitude_in_micro_degrees = int(LONGITUDE * 1_000_000)
    ops.append(add_op)

    response = service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    print(f"Removed {len(old_location_resources)} country-level location criteria")
    print(f"Added: {RADIUS_KM}km radius around Downtown Toronto")


if __name__ == "__main__":
    fix_presence_only()
    swap_to_toronto_radius()
