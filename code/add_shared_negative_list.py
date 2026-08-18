"""Creates a Shared Negative Keyword List with the 150 universal terms from
universal-negative-keywords.md (sections A.1-A.7), all BROAD match, and
attaches it to the Business Automation Agency campaign.

Run: py code/add_shared_negative_list.py
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
LIST_NAME = "Universal Service Business Negatives v1"

# A.1 Job seekers (37 lines in source; "vacancy" was listed twice, deduped here)
JOB_SEEKERS = [
    "jobs", "job", "hiring", "recruit", "recruiting", "recruitment", "recruiter",
    "career", "careers", "employment", "employer", "employee", "salary", "salaries",
    "wage", "wages", "hourly pay", "resume", "cv", "intern", "interns", "internship",
    "internships", "apprentice", "apprentices", "apprenticeship", "apprenticeships",
    "volunteer", "vacancy", "vacancies", "position open", "hiring near me",
    "work from home", "indeed", "glassdoor", "ziprecruiter",
]

# A.2 DIY / How-to / Tutorial (28)
DIY_HOWTO = [
    "diy", "do it yourself", "how to", "howto", "how do", "how do you", "tutorial",
    "tutorials", "guide", "guides", "step by step", "instructions", "youtube",
    "video", "videos", "template", "templates", "example", "examples",
    "how to fix", "how to repair", "how to install", "how to remove",
    "how to clean", "how to replace", "how to build", "homemade", "yourself",
]

# A.3 Education / Training / Schools (22)
EDUCATION = [
    "school", "schools", "schooling", "college", "university", "class", "classes",
    "course", "courses", "training", "trainee", "trained", "certification",
    "certificate", "certified", "license cost", "licensing", "license requirement",
    "license requirements", "become a", "how to become", "exam",
]

# A.4 Free / Discount / Cheap (15)
FREE_DISCOUNT = [
    "free", "freebie", "giveaway", "giveaways", "sample", "samples", "trial",
    "discount", "discounted", "voucher", "coupon", "coupons", "promo code",
    "clearance", "secondhand",
]

# A.5 Informational research (16)
INFORMATIONAL = [
    "what is", "what is a", "what does", "what are", "meaning", "definition",
    "wikipedia", "wiki", "reddit", "quora", "forum", "forums", "blog", "review",
    "reviews", "ratings",
]

# A.6 Customer support / existing customers (18)
CUSTOMER_SUPPORT = [
    "complaint", "complaints", "refund", "refunds", "return policy", "cancel",
    "cancellation", "warranty claim", "problem", "problems", "not working",
    "broken", "contact", "phone number", "customer service", "help", "login",
    "sign in",
]

# A.7 Restricted / unsafe (14)
RESTRICTED = [
    "porn", "adult", "nude", "sex", "gambling", "casino", "weed", "marijuana",
    "cbd", "crypto", "bitcoin", "nft", "mlm", "ponzi",
]

ALL_TERMS = (
    JOB_SEEKERS + DIY_HOWTO + EDUCATION + FREE_DISCOUNT + INFORMATIONAL
    + CUSTOMER_SUPPORT + RESTRICTED
)


def create_shared_set():
    service = client.get_service("SharedSetService")
    op = client.get_type("SharedSetOperation")
    shared_set = op.create
    shared_set.name = LIST_NAME
    shared_set.type_ = client.enums.SharedSetTypeEnum.NEGATIVE_KEYWORDS
    response = service.mutate_shared_sets(customer_id=customer_id, operations=[op])
    resource = response.results[0].resource_name
    print(f"Shared set created: {resource}")
    return resource


def add_shared_criteria(shared_set_resource):
    service = client.get_service("SharedCriterionService")
    ops = []
    for term in ALL_TERMS:
        op = client.get_type("SharedCriterionOperation")
        crit = op.create
        crit.shared_set = shared_set_resource
        crit.keyword.text = term
        crit.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        ops.append(op)
    response = service.mutate_shared_criteria(customer_id=customer_id, operations=ops)
    print(f"Added {len(response.results)} negative keywords to shared list")


def attach_to_campaign(shared_set_resource):
    service = client.get_service("CampaignSharedSetService")
    op = client.get_type("CampaignSharedSetOperation")
    css = op.create
    css.campaign = CAMPAIGN_RESOURCE
    css.shared_set = shared_set_resource
    response = service.mutate_campaign_shared_sets(customer_id=customer_id, operations=[op])
    print(f"Attached to campaign: {response.results[0].resource_name}")


def main():
    print(f"Total terms: {len(ALL_TERMS)}")
    shared_set_resource = create_shared_set()
    add_shared_criteria(shared_set_resource)
    attach_to_campaign(shared_set_resource)
    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            print(f"ERROR: {error.message}")
        raise
