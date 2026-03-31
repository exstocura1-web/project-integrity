"""
Pull recent Email Triage v2 executions from n8n Cloud and print error details.

Usage:
  py -3 email-triage-executions.py
  py -3 email-triage-executions.py --limit 40 --errors-only
  py -3 email-triage-executions.py --since 2026-03-30T19:20:00Z --until 2026-03-30T19:35:00Z
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from typing import Any

from n8n_workflow_common import EMAIL_TRIAGE_ID, api_request, load_cloud_credentials


def parse_iso(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def in_window(
    started_at: str | None, since: datetime | None, until: datetime | None
) -> bool:
    if not started_at:
        return True
    try:
        if started_at.endswith("Z"):
            dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(started_at)
    except ValueError:
        return True
    if since and dt < since:
        return False
    if until and dt > until:
        return False
    return True


def main() -> int:
    p = argparse.ArgumentParser(description="Inspect Email Triage workflow executions")
    p.add_argument("--limit", type=int, default=35)
    p.add_argument("--errors-only", action="store_true")
    p.add_argument("--since", type=str, default="", help="ISO time UTC, e.g. 2026-03-30T19:20:00Z")
    p.add_argument("--until", type=str, default="", help="ISO time UTC")
    args = p.parse_args()

    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY", file=sys.stderr)
        return 1

    since = parse_iso(args.since) if args.since.strip() else None
    until = parse_iso(args.until) if args.until.strip() else None

    q = f"workflowId={EMAIL_TRIAGE_ID}&limit={args.limit}"
    code, data = api_request("GET", f"{base}/api/v1/executions?{q}", key)
    if code != 200:
        print(f"LIST HTTP {code} {json.dumps(data, ensure_ascii=False)[:800]}", file=sys.stderr)
        return 1

    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        rows = []

    print(f"workflow_id={EMAIL_TRIAGE_ID}  list_count={len(rows)}")
    shown = 0
    for ex in rows:
        eid = ex.get("id")
        st = ex.get("status")
        mode = ex.get("mode")
        started = ex.get("startedAt") or ""
        if not in_window(started, since, until):
            continue
        if args.errors_only and st == "success" and mode != "error":
            # "error" mode may still report status success for sub-runs in some builds; still show errors
            if mode != "error":
                continue

        c2, detail = api_request(
            "GET", f"{base}/api/v1/executions/{eid}?includeData=true", key
        )
        if c2 != 200:
            print(f"\n--- exec {eid} {started} list_status={st} mode={mode} ---")
            print(f"  GET detail FAILED HTTP {c2}")
            shown += 1
            continue

        err_blob: Any = None
        last_nodes: list[str] = []
        failed_nodes: list[str] = []
        if isinstance(detail, dict):
            inner = detail.get("data") or detail
            res = inner.get("resultData") or {}
            rd = res.get("runData")
            if isinstance(rd, dict):
                last_nodes = list(rd.keys())[-5:]
                for n, runs in rd.items():
                    if not isinstance(runs, list):
                        continue
                    for run in runs:
                        if run.get("executionStatus") == "error":
                            failed_nodes.append(n)
                            break
            err_blob = res.get("error")

        print(f"\n--- exec {eid} ---")
        print(f"  started: {started}")
        print(f"  status: {st}  mode: {mode}")
        if last_nodes:
            print(f"  last_nodes: {' -> '.join(last_nodes)}")
        if failed_nodes:
            print(f"  failed_nodes: {', '.join(failed_nodes)}")
        if err_blob:
            print("  resultData.error:")
            print(json.dumps(err_blob, indent=2, ensure_ascii=False)[:5000])
            msg = err_blob.get("message") if isinstance(err_blob, dict) else None
            if msg:
                print(f"  summary: {msg}")
        elif st == "error" or mode == "error":
            print("  (no resultData.error blob; check failed_nodes / n8n UI)")

        shown += 1

    if shown == 0:
        print("\nNo executions matched filters.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
