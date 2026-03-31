"""Rename unicode-arrow Code node to ASCII for Email Triage v2 (cosmetic, Cloud API)."""
from __future__ import annotations

import sys

from n8n_workflow_common import (
    EMAIL_TRIAGE_ID,
    api_request,
    load_cloud_credentials,
    strip_workflow_for_put,
)

OLD = "Test \u2192 Triage Shape"
NEW = "Test to Triage Shape"


def main() -> int:
    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing credentials", file=sys.stderr)
        return 1
    code, wf = api_request("GET", f"{base}/api/v1/workflows/{EMAIL_TRIAGE_ID}", key)
    if code != 200:
        return 1

    found = False
    for n in wf.get("nodes") or []:
        if n.get("name") == OLD:
            n["name"] = NEW
            found = True
            break
    if not found:
        print("No rename needed.")
        return 0

    conn = wf.get("connections") or {}
    if OLD in conn:
        conn[NEW] = conn.pop(OLD)
    for _src, block in list(conn.items()):
        for row in block.get("main") or []:
            for link in row or []:
                if link.get("node") == OLD:
                    link["node"] = NEW

    pcode, _ = api_request(
        "PUT",
        f"{base}/api/v1/workflows/{EMAIL_TRIAGE_ID}",
        key,
        strip_workflow_for_put(wf),
    )
    if pcode != 200:
        print(f"PUT failed {pcode}", file=sys.stderr)
        return 1
    sys.stdout.write("Renamed code node to ASCII name.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
