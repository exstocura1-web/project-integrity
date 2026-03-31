"""
One-shot: replace retired Anthropic model id on n8n Cloud Email Triage v2 Claude Classify node.

Reads C:\\Exsto\\.env (N8N_CLOUD_URL, N8N_CLOUD_API_KEY). Safe to re-run (no-op if already updated).
"""
from __future__ import annotations

import sys

from n8n_workflow_common import (
    EMAIL_TRIAGE_ID,
    api_request,
    load_cloud_credentials,
    strip_workflow_for_put,
)

OLD_MODEL = "claude-3-5-haiku-20241022"
NEW_MODEL = "claude-sonnet-4-20250514"


def main() -> int:
    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY", file=sys.stderr)
        return 1

    code, wf = api_request("GET", f"{base}/api/v1/workflows/{EMAIL_TRIAGE_ID}", key)
    if code != 200:
        print(f"GET workflow HTTP {code}", file=sys.stderr)
        return 1

    changed = 0
    for n in wf.get("nodes") or []:
        jb = (n.get("parameters") or {}).get("jsonBody")
        if not isinstance(jb, str) or OLD_MODEL not in jb:
            continue
        n.setdefault("parameters", {})["jsonBody"] = jb.replace(OLD_MODEL, NEW_MODEL)
        changed += 1
        print(f"Patched node: {n.get('name')!r}")

    if changed == 0:
        print("No nodes contained the old model string; nothing to do.")
        return 0

    pcode, presp = api_request(
        "PUT",
        f"{base}/api/v1/workflows/{EMAIL_TRIAGE_ID}",
        key,
        strip_workflow_for_put(wf),
    )
    if pcode != 200:
        print(f"PUT workflow HTTP {pcode} {presp}", file=sys.stderr)
        return 1

    print("OK: Email Triage v2 updated on Cloud (Claude Classify -> sonnet-4 per MODEL-GOVERNANCE).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
