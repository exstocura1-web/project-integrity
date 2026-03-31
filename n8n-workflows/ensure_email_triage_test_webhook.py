"""
Add POST /webhook/email-triage-test to Email Triage v2 on n8n Cloud (idempotent).

Feeds Dedup Check with the same JSON shape as Extract Fields. Webhook uses
responseMode onReceived so HTTP returns immediately while the workflow finishes
(smtp / notion as configured).

Usage:
  py -3 ensure_email_triage_test_webhook.py
"""
from __future__ import annotations

import json
import sys
import uuid

from n8n_workflow_common import (
    EMAIL_TRIAGE_ID,
    api_request,
    load_cloud_credentials,
    strip_workflow_for_put,
)

HOOK_NAME = "Webhook (Test Triage)"
CODE_NAME = "Test to Triage Shape"
WEBHOOK_PATH = "email-triage-test"

CODE_JS = """const r = $input.first().json;
const b = (r.body && typeof r.body === 'object' && !Array.isArray(r.body)) ? r.body : r;
const from = b.from || b.From || 'Triage Test <triage-test@exstocura.com>';
const subject = b.subject || b.Subject || 'Test — CHPE owner readout';
const body = String(
  b.body ||
  b.Body ||
  'We need confirmation of forensic schedule narrative before Tuesday.'
);
const emailId = b.emailId || ('webhook-test-' + Date.now());
const threadId = b.threadId || emailId;
return [{ json: { from, subject, body, emailId, threadId } }];"""


def main() -> int:
    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY", file=sys.stderr)
        return 1

    code, wf = api_request("GET", f"{base}/api/v1/workflows/{EMAIL_TRIAGE_ID}", key)
    if code != 200:
        print(f"GET workflow HTTP {code}", file=sys.stderr)
        return 1

    names = {n["name"] for n in wf.get("nodes") or []}
    if HOOK_NAME in names:
        print(f"OK: {HOOK_NAME!r} already on workflow; no change.")
    else:
        hook = {
            "parameters": {
                "httpMethod": "POST",
                "path": WEBHOOK_PATH,
                "responseMode": "onReceived",
                "options": {},
            },
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-2144, 1584],
            "name": HOOK_NAME,
            "webhookId": str(uuid.uuid4()),
        }
        code_node = {
            "parameters": {"jsCode": CODE_JS},
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-1904, 1584],
            "name": CODE_NAME,
        }
        wf["nodes"] = list(wf.get("nodes") or []) + [hook, code_node]
        conn = wf.setdefault("connections", {})
        conn[HOOK_NAME] = {
            "main": [[{"node": CODE_NAME, "type": "main", "index": 0}]]
        }
        conn[CODE_NAME] = {
            "main": [[{"node": "Dedup Check", "type": "main", "index": 0}]]
        }

        pcode, presp = api_request(
            "PUT",
            f"{base}/api/v1/workflows/{EMAIL_TRIAGE_ID}",
            key,
            strip_workflow_for_put(wf),
        )
        if pcode != 200:
            print(f"PUT workflow HTTP {pcode} {json.dumps(presp)[:1500]}", file=sys.stderr)
            return 1
        print(f"OK: added {HOOK_NAME!r} and {CODE_NAME!r}; workflow updated.")

    prod_url = f"{base.rstrip('/')}/webhook/{WEBHOOK_PATH}"
    print("\nProduction webhook URL (workflow must stay ACTIVE):")
    print(prod_url)
    print(
        '\nExample: curl -X POST "%s" -H "Content-Type: application/json" -d "{\\"subject\\":\\"Test\\",\\"body\\":\\"Please classify this.\\",\\"from\\":\\"qa@exstocura.com\\"}"'
        % prod_url
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
