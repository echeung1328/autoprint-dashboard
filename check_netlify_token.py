import requests
import json
import os

# Netlify Personal Access Token - need to get from user or use environment
# For now, let's try to deploy using the Netlify API with a draft token
# Actually, let's use the netlify sites API to create a site and deploy

# First, let's check if there's a NETLIFY_AUTH_TOKEN in environment
token = os.environ.get('NETLIFY_AUTH_TOKEN') or os.environ.get('NETLIFY_TOKEN')
print(f"NETLIFY_AUTH_TOKEN present: {bool(token)}")
print(f"NETLIFY_TOKEN present: {bool(os.environ.get('NETLIFY_TOKEN'))}")

# If no token, we need to guide user to login or provide token
if not token:
    print("\nNetlify token not found in environment.")
    print("Please either:")
    print("1. Run `npx netlify login` manually in your terminal")
    print("2. Or provide a Netlify personal access token")
    print("\nAlternatively, you can connect Netlify to your GitHub repo manually:")
    print("  https://app.netlify.com/start -> Import from Git -> echeung1328/autoprint-dashboard")
