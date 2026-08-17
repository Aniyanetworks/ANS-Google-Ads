"""Tests the Google Ads API connection.

Reads creds from .env, pulls one campaign to confirm everything works.
"""

from dotenv import load_dotenv
import os
from google.ads.googleads.client import GoogleAdsClient

load_dotenv()

config = {
    "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
    "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
    "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
    # No login_customer_id: this login has direct access to the target
    # account, not solely through the MCC hierarchy. Setting it to the MCC
    # here fails, because the account isn't actually a linked child of it.
    "use_proto_plus": True,
}

client = GoogleAdsClient.load_from_dict(config)
ga_service = client.get_service("GoogleAdsService")

customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")
query = """
    SELECT campaign.id, campaign.name, campaign.status
    FROM campaign
    LIMIT 5
"""

response = ga_service.search(customer_id=customer_id, query=query)
print("\nConnection works. First 5 campaigns:\n")
for row in response:
    print(f"  - {row.campaign.name} ({row.campaign.status.name})")
