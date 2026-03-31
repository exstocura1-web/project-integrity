"""Print n8n Cloud workflow list + recent executions (reads C:\\Exsto\\.env)."""
from __future__ import annotations

import sys
import urllib.parse

from n8n_workflow_common import api_request, load_cloud_credentials


def main() -> int:
    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY in C:\\Exsto\\.env", file=sys.stderr)
        return 1

    c, wf = api_request("GET", f"{base}/api/v1/workflows?limit=250", key)
    print("GET /workflows", c)
    items = wf.get("data") if isinstance(wf, dict) else None
    if items is None:
        items = wf if isinstance(wf, list) else []
    print("workflow_count", len(items))
    for w in sorted(items, key=lambda x: (not x.get("active"), x.get("name") or "")):
        on = "active" if w.get("active") else "inactive"
        print(f"  [{on}] {w.get('id')} | {w.get('name')}")

    q = urllib.parse.urlencode({"limit": "25"})
    c2, ex = api_request("GET", f"{base}/api/v1/executions?{q}", key)
    print("GET /executions", c2)
    rows = []
    if isinstance(ex, dict):
        rows = ex.get("data") or ex.get("results") or []
    if not isinstance(rows, list):
        rows = []
    print("recent_execution_rows", len(rows))
    for e in rows[:15]:
        wid = e.get("workflowId", "?")
        st = e.get("status", "?")
        mode = e.get("mode", "?")
        started = e.get("startedAt") or ""
        if len(started) > 19:
            started = started[:19]
        print(f"  {started} | {st:8} | {mode:12} | wf {wid}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
