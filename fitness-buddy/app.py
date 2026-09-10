"""
Fitness Buddy – Python Flask Backend
IBM Granite AI Integration via IBM Cloud IAM
Run: python app.py
"""

import os
import time
import json
import requests
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

# ── Load environment variables from .env ──────────────────────────
load_dotenv()

app = Flask(__name__, static_folder=".")

# ── IBM Cloud Config (loaded from .env) ───────────────────────────
IBM_API_KEY      = os.getenv("IBM_API_KEY")
IBM_PROJECT_ID   = os.getenv("IBM_PROJECT_ID")
IBM_MODEL_ID     = os.getenv("IBM_MODEL_ID", "ibm/granite-4-h-small")
IBM_GRANITE_URL  = os.getenv("IBM_GRANITE_URL", "https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2023-05-29")
IBM_IAM_URL      = "https://iam.cloud.ibm.com/identity/token"

# ── Token cache (in-memory) ───────────────────────────────────────
_token_cache = {"token": None, "expiry": 0}


def get_iam_token():
    """Fetch and cache an IBM IAM bearer token."""
    if _token_cache["token"] and time.time() < _token_cache["expiry"]:
        return _token_cache["token"]

    resp = requests.post(
        IBM_IAM_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
            "apikey": IBM_API_KEY,
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["token"]  = data["access_token"]
    _token_cache["expiry"] = time.time() + data["expires_in"] - 60
    return _token_cache["token"]


# ── Routes ────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main HTML file."""
    return send_from_directory(".", "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    """Serve static assets (CSS, JS, images)."""
    return send_from_directory(".", filename)


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Proxy endpoint for IBM Granite AI.
    Receives the chat payload from the browser,
    adds IAM auth server-side, and forwards to IBM.
    """
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "Empty request body"}), 400

        # Inject project_id and model_id from env if not provided
        payload.setdefault("project_id", IBM_PROJECT_ID)
        payload.setdefault("model_id",   IBM_MODEL_ID)

        token = get_iam_token()

        granite_resp = requests.post(
            IBM_GRANITE_URL,
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {token}",
            },
            json=payload,
            timeout=60,
        )
        granite_resp.raise_for_status()
        return jsonify(granite_resp.json())

    except requests.exceptions.HTTPError as e:
        return jsonify({"error": f"IBM API error: {e.response.text}"}), e.response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request to IBM timed out"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/health")
def health():
    """Simple health-check endpoint."""
    return jsonify({
        "status":   "ok",
        "model":    IBM_MODEL_ID,
        "project":  IBM_PROJECT_ID,
    })


# ── Entry point ───────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    print(f"\n✅ Fitness Buddy running at http://localhost:{port}")
    print(f"   Model  : {IBM_MODEL_ID}")
    print(f"   Project: {IBM_PROJECT_ID}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
