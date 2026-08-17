"""Rebuilds the proximity location criterion on campaign 24153906412 with
address fields populated (city/province/country), so the UI shows a
readable label instead of raw coordinates.

Run: py code/fix_geo_label.py
"""

import os
from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient

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

LATITUDE = 43.6532
LONGITUDE = -79.3832
RADIUS_KM = 50


def main():
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT campaign_criterion.resource_name
        FROM campaign_criterion
        WHERE campaign_criterion.campaign = '{CAMPAIGN_RESOURCE}'
          AND campaign_criterion.negative = false
          AND campaign_criterion.type = 'PROXIMITY'
    """
    rows = ga_service.search(customer_id=customer_id, query=query)
    old_resources = [row.campaign_criterion.resource_name for row in rows]

    service = client.get_service("CampaignCriterionService")
    ops = []

    for resource in old_resources:
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
    crit.proximity.address.city_name = "Toronto"
    crit.proximity.address.province_code = "ON"
    crit.proximity.address.province_name = "Ontario"
    crit.proximity.address.country_code = "CA"
    ops.append(add_op)

    service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    print(f"Removed {len(old_resources)} old proximity criteria")
    print("Added: 50km radius around Toronto, ON, CA (with address label)")


if __name__ == "__main__":
    main()
