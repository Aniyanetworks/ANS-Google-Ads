"""Creates the warm-pixel user list (anyone who visited any page on the
domain in the last 540 days) and attaches it to an ad group as an RLSA
observation with a bid modifier.

Run: py code/setup_warm_pixel_audience.py
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

DOMAIN = "aniyanetworks.net"
LIST_NAME = f"Warm pixel · all visitors · {DOMAIN} · 540d"
AD_GROUP_ID = "202407486627"
AD_GROUP_RESOURCE = f"customers/{customer_id}/adGroups/{AD_GROUP_ID}"
BID_MODIFIER_PCT = 50


def find_existing_list():
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT user_list.resource_name
        FROM user_list
        WHERE user_list.name = '{LIST_NAME}'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    return rows[0].user_list.resource_name if rows else None


def create_user_list():
    service = client.get_service("UserListService")
    op = client.get_type("UserListOperation")
    ul = op.create
    ul.name = LIST_NAME
    ul.description = (
        f"Anyone who has visited any page on {DOMAIN} in the last 540 days. "
        "Populated automatically by the global gtag."
    )
    ul.membership_status = client.enums.UserListMembershipStatusEnum.OPEN
    ul.membership_life_span = 540

    rule_item = client.get_type("UserListRuleItemInfo")
    rule_item.name = "url__"
    rule_item.string_rule_item.operator = (
        client.enums.UserListStringRuleItemOperatorEnum.CONTAINS
    )
    rule_item.string_rule_item.value = DOMAIN

    rule_item_group = client.get_type("UserListRuleItemGroupInfo")
    rule_item_group.rule_items.append(rule_item)

    flexible_rule = ul.rule_based_user_list.flexible_rule_user_list
    operand = client.get_type("FlexibleRuleOperandInfo")
    operand.rule.rule_item_groups.append(rule_item_group)
    operand.lookback_window_days = 540
    flexible_rule.inclusive_operands.append(operand)
    flexible_rule.inclusive_rule_operator = (
        client.enums.UserListFlexibleRuleOperatorEnum.AND
    )

    response = service.mutate_user_lists(customer_id=customer_id, operations=[op])
    return response.results[0].resource_name


def ensure_observation_mode():
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group.targeting_setting.target_restrictions
        FROM ad_group
        WHERE ad_group.resource_name = '{AD_GROUP_RESOURCE}'
    """
    rows = list(ga_service.search(customer_id=customer_id, query=query))
    restrictions = rows[0].ad_group.targeting_setting.target_restrictions

    has_user_interest_restriction = any(
        r.targeting_dimension == client.enums.TargetingDimensionEnum.AUDIENCE
        and r.bid_only is False
        for r in restrictions
    )
    if not has_user_interest_restriction:
        return  # already Observation (or no restriction set, which defaults fine)

    service = client.get_service("AdGroupService")
    op = client.get_type("AdGroupOperation")
    ag = op.update
    ag.resource_name = AD_GROUP_RESOURCE
    new_restriction = client.get_type("TargetRestriction")
    new_restriction.targeting_dimension = client.enums.TargetingDimensionEnum.AUDIENCE
    new_restriction.bid_only = True
    ag.targeting_setting.target_restrictions.append(new_restriction)
    op.update_mask.paths.append("targeting_setting.target_restrictions")
    service.mutate_ad_groups(customer_id=customer_id, operations=[op])
    print("Ad group targeting set to Observation mode for audiences")


def attach_audience(user_list_resource):
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    crit = op.create
    crit.ad_group = AD_GROUP_RESOURCE
    crit.user_list.user_list = user_list_resource
    crit.bid_modifier = 1.0 + (BID_MODIFIER_PCT / 100)
    crit.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
    response = service.mutate_ad_group_criteria(customer_id=customer_id, operations=[op])
    return response.results[0].resource_name


def main():
    existing = find_existing_list()
    if existing:
        user_list_resource = existing
        print(f"User list already exists: {user_list_resource}")
    else:
        user_list_resource = create_user_list()
        print(f"User list created: {user_list_resource}")

    ensure_observation_mode()
    attach_resource = attach_audience(user_list_resource)
    print(f"Attached to ad group as +{BID_MODIFIER_PCT}% bid observation: {attach_resource}")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            print(f"ERROR: {error.message}")
        raise
