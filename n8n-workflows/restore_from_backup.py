#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
One-command restore from pre-inject backups (PUT stripped JSON to n8n Cloud).

Usage:
  cd C:\\Exsto\\n8n-workflows && python restore_from_backup.py
  cd C:\\Exsto\\n8n-workflows && python restore_from_backup.py 8Lg3lsjoraEUizfw
  cd C:\\Exsto\\n8n-workflows && python restore_from_backup.py DbRCcPqBatSFLR27

Requires: python-dotenv, N8N_CLOUD_URL + N8N_CLOUD_API_KEY in C:\\Exsto\\.env
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from n8n_workflow_common import (
    BACKUP_DIR,
    EMAIL_TRIAGE_ID,
    INJECT_REPORT_PATH,
    WORKFLOW_ID_BACKUP,
    api_request,
    load_cloud_credentials,
    load_inject_report,
    strip_workflow_for_put,
)

LOG_PATH = BACKUP_DIR / "restore_log.txt"


def log_line(msg: str) -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(msg.rstrip() + "\n")


def validate_report_backups() -> None:
    report = load_inject_report()
    reported = {row.get("backup") for row in report if isinstance(row, dict)}
    for row in WORKFLOW_ID_BACKUP:
        b = row["backup"]
        if b not in reported:
            raise ValueError(
                f"Backup {b!r} not listed in {INJECT_REPORT_PATH.name} — halt."
            )


def resolve_targets(cli_id: str | None) -> list[dict[str, str]]:
    if cli_id:
        if cli_id.strip() == EMAIL_TRIAGE_ID:
            print("Refusing to restore Email Triage — hard-coded exclusion.", file=sys.stderr)
            sys.exit(1)
        for row in WORKFLOW_ID_BACKUP:
            if row["id"] == cli_id.strip():
                return [row]
        print(f"Unknown workflow id {cli_id!r}. Allowed:", file=sys.stderr)
        for row in WORKFLOW_ID_BACKUP:
            print(f"  {row['id']}", file=sys.stderr)
        sys.exit(1)
    return list(WORKFLOW_ID_BACKUP)


def main() -> int:
    cli_id = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        validate_report_backups()
    except Exception as e:
        print(f"Halt: {e}", file=sys.stderr)
        return 1

    targets = resolve_targets(cli_id)
    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY in .env", file=sys.stderr)
        return 1

    print("\n=== RESTORE DRY-RUN (no changes yet) ===\n")
    for row in targets:
        path = BACKUP_DIR / row["backup"]
        ok = path.is_file()
        print(f"  ID: {row['id']}")
        print(f"  File: {path.name}  [{'OK' if ok else 'MISSING'}]")
        if ok:
            meta = json.loads(path.read_text(encoding="utf-8"))
            print(f"  Workflow name: {meta.get('name', '?')}")
        print()

    missing = [t for t in targets if not (BACKUP_DIR / t["backup"]).is_file()]
    if missing:
        print("Abort: missing backup file(s).", file=sys.stderr)
        return 1

    print('Type "yes" to PUT these workflow(s) from backup (this overwrites Cloud JSON): ', end="", flush=True)
    if input().strip().lower() != "yes":
        print("Aborted.")
        return 0

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for row in targets:
        wid = row["id"]
        path = BACKUP_DIR / row["backup"]
        wf = json.loads(path.read_text(encoding="utf-8"))
        name = wf.get("name", wid)
        put_body = strip_workflow_for_put(json.loads(json.dumps(wf)))
        code, resp = api_request("PUT", f"{base}/api/v1/workflows/{wid}", key, put_body)

        if code != 200:
            body = json.dumps(resp, ensure_ascii=False) if isinstance(resp, dict) else str(resp)
            print(f"[FAIL] {name} | HTTP {code}\n{body}", file=sys.stderr)
            log_line(
                f"[{ts}] | {name} | {wid} | FAIL | HTTP {code} | {body[:500]}"
            )
            return 1

        print(f"[OK] Restored {name} (HTTP {code})")
        log_line(f"[{ts}] | {name} | {wid} | OK | HTTP {code}")

    print("\nAll requested restores completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
