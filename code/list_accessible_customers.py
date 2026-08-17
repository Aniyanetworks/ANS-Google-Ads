"""Lists every Google Ads customer ID accessible with the current refresh token."""

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
customer_service = client.get_service("CustomerService")
response = customer_service.list_accessible_customers()

print("Accessible customer IDs for this refresh token:")
for resource_name in response.resource_names:
    print(f"  {resource_name}")
