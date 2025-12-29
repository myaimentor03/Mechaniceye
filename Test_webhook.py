import requests
from datetime import datetime, timezone

print("✅ File is running")

WEBHOOK_URL = "https://hook.us2.make.com/uopc915jv6hvfv98mfdpdeynaz7sdngj"

# Constructing the payload
payload = {
    "user_email": "myaimentor@gmail.com",
    "issue_type": "engine_noise",
    "subscription_tier": "Pro",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "vehicle_info": {
        "make": "Honda",
        "model": "Civic",
        "year": 2015
    },
    "symptoms": [
        "Rattling sound when accelerating",
        "Check engine light on"
    ]
}

print("🚀 Sending Mechanic’s Eye case data...")

try:
    response = requests.post(WEBHOOK_URL, json=payload)
    print(f"✅ Webhook sent! Status code: {response.status_code}")
    print("🖁️ Response:", response.text)
except Exception as e:
    print("❌ ERROR sending webhook:", str(e))

