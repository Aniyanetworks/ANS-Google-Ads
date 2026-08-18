"""Creates the 'Lead · Form Submit' conversion action and prints the tag IDs.

Run: py code/setup_conversion_action.py
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

CONVERSION_NAME = "Lead · Form Submit"
LEAD_VALUE = 500.0
CURRENCY = "USD"


def find_existing():
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT conversion_action.resource_name, conversion_action.id,
               conversion_action.tag_snippets
        FROM conversion_action
        WHERE conversion_action.name = '{CONVERSION_NAME}'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    return rows[0] if rows else None


def create_conversion_action():
    service = client.get_service("ConversionActionService")
    op = client.get_type("ConversionActionOperation")
    ca = op.create
    ca.name = CONVERSION_NAME
    ca.category = client.enums.ConversionActionCategoryEnum.SUBMIT_LEAD_FORM
    ca.type_ = client.enums.ConversionActionTypeEnum.WEBPAGE
    ca.status = client.enums.ConversionActionStatusEnum.ENABLED
    ca.value_settings.default_value = LEAD_VALUE
    ca.value_settings.default_currency_code = CURRENCY
    ca.value_settings.always_use_default_value = False
    ca.counting_type = client.enums.ConversionActionCountingTypeEnum.ONE_PER_CLICK
    ca.click_through_lookback_window_days = 90
    ca.view_through_lookback_window_days = 1
    ca.primary_for_goal = True
    try:
        ca.attribution_model_settings.attribution_model = (
            client.enums.AttributionModelEnum.GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN
        )
        response = service.mutate_conversion_actions(customer_id=customer_id, operations=[op])
    except GoogleAdsException:
        # Fall back if the account isn't eligible for data-driven attribution yet.
        ca.attribution_model_settings.attribution_model = (
            client.enums.AttributionModelEnum.GOOGLE_ADS_LAST_CLICK
        )
        response = service.mutate_conversion_actions(customer_id=customer_id, operations=[op])
    return response.results[0].resource_name


def main():
    existing = find_existing()
    if existing:
        resource_name = existing.conversion_action.resource_name
        tag_snippets = existing.conversion_action.tag_snippets
        print(f"Conversion action already exists: {resource_name}")
    else:
        resource_name = create_conversion_action()
        print(f"Conversion action created: {resource_name}")
        ga_service = client.get_service("GoogleAdsService")
        query = f"""
            SELECT conversion_action.tag_snippets
            FROM conversion_action
            WHERE conversion_action.resource_name = '{resource_name}'
        """
        rows = list(ga_service.search(customer_id=customer_id, query=query))
        tag_snippets = rows[0].conversion_action.tag_snippets

    aw_id = None
    conversion_label_full = None
    for snippet in tag_snippets:
        global_html = snippet.global_site_tag
        event_html = snippet.event_snippet
        if global_html:
            import re

            m = re.search(r"G-[A-Z0-9]+", global_html)
            if m:
                aw_id = m.group(0)
        if event_html:
            m = re.search(r"AW-\d+/[A-Za-z0-9_-]+", event_html)
            if m:
                conversion_label_full = m.group(0)

    print(f"AW ID: {aw_id}")
    print(f"Conversion label: {conversion_label_full}")
    print(f"RESOURCE_NAME={resource_name}")
    print(f"AW_ID={aw_id}")
    print(f"CONVERSION_LABEL={conversion_label_full}")


if __name__ == "__main__":
    main()
