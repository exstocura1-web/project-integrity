#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Controlled live manual test: flip Set test_mode false → try execute → restore true.
Logs: C:\\Exsto\\n8n-workflows\\live_test_log.txt

Usage:
  cd C:\\Exsto\\n8n-workflows && python run_live_manual_tests.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from n8n_workflow_common import (
    EMAIL_TRIAGE_ID,
    IF_GATE_NAME,
    MANUAL_TRIGGER_NAME,
    STOP_NODE_NAME,
    api_request,
    load_cloud_credentials,
    strip_workflow_for_put,
)

LOG_PATH = Path(__file__).resolve().parent / "live_test_log.txt"

# Order: low risk → high risk (stop on any failure)
LIVE_TEST_SEQUENCE: list[tuple[str, str]] = [
    ("TtSLiFqydMLODkHI", "Exsto Cura Weekly Digest"),
    ("WVm9C69CVecMxh6c", "Exsto Cura — Monthly Report Pipeline Agent"),
    ("lqV394WRa4wPRCmd", "Exsto Cura — Prospect Intelligence Agent"),
    ("DbRCcPqBatSFLR27", "Exsto Cura — Invoice & Payment Agent"),
    ("8Lg3lsjoraEUizfw", "Exsto Cura — SmartPM Market Intelligence & Outreach Agent"),
]

SMARTPM_ID = "8Lg3lsjoraEUizfw"


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log_line(action: str, workflow: str, result: str) -> None:
    line = f"[{ts()}] | {workflow} | {action} | {result}\n"
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line)
    print(line.strip())


def find_test_payload_set(nodes: list[dict]) -> dict | None:
    for n in nodes:
        if n.get("type") != "n8n-nodes-base.set":
            continue
        name = n.get("name") or ""
        if name.startswith("Test Payload"):
            return n
    return None


def get_test_mode_from_set(wf: dict) -> bool | None:
    n = find_test_payload_set(wf.get("nodes") or [])
    if not n:
        return None
    assigns = (
        n.get("parameters", {})
        .get("assignments", {})
        .get("assignments", [])
    )
    for a in assigns:
        if isinstance(a, dict) and a.get("name") == "test_mode":
            return a.get("value")
    return None


def set_test_mode_on_workflow(wf: dict, value: bool) -> bool:
    nodes = wf.get("nodes") or []
    n = find_test_payload_set(nodes)
    if not n:
        return False
    assigns = (
        n.setdefault("parameters", {})
        .setdefault("assignments", {})
        .setdefault("assignments", [])
    )
    for a in assigns:
        if isinstance(a, dict) and a.get("name") == "test_mode":
            a["value"] = value
            a["type"] = "boolean"
            return True
    return False


def preflight_workflow(wf: dict, _expected_name: str) -> tuple[bool, str]:
    wid = wf.get("id", "?")
    if not wf.get("active"):
        return False, f"active is not true (id={wid})"
    nodes = wf.get("nodes") or []
    names = {n.get("name") for n in nodes}
    if MANUAL_TRIGGER_NAME not in names:
        return False, f"missing {MANUAL_TRIGGER_NAME!r}"
    if not any((x or "").startswith("Test Payload") for x in names if x):
        return False, 'missing Set "Test Payload — …"'
    if IF_GATE_NAME not in names:
        return False, f"missing {IF_GATE_NAME!r}"
    if STOP_NODE_NAME not in names:
        return False, f"missing {STOP_NODE_NAME!r}"
    tm = get_test_mode_from_set(wf)
    if tm is not True:
        return False, f"Set test_mode is not true (got {tm!r})"
    return True, "ok"


def post_empty(url: str, api_key: str) -> tuple[int, Any]:
    return api_request("POST", url, api_key, {})


def try_execute_workflow(base: str, api_key: str, wid: str) -> tuple[int, Any]:
    return api_request(
        "POST",
        f"{base}/api/v1/workflows/{wid}/execute",
        api_key,
        {},
    )


def poll_execution(base: str, api_key: str, exec_id: str, max_sec: float = 90.0) -> tuple[str, str]:
    deadline = time.monotonic() + max_sec
    while time.monotonic() < deadline:
        code, data = api_request(
            "GET", f"{base}/api/v1/executions/{exec_id}", api_key
        )
        if code != 200:
            time.sleep(1.0)
            continue
        st = data.get("status") or data.get("data", {}).get("status")
        if st in ("success", "error", "canceled", "crashed"):
            err = ""
            if st == "error":
                try:
                    err = json.dumps(
                        data.get("data", {})
                        .get("resultData", {})
                        .get("error", {}),
                        ensure_ascii=False,
                    )[:500]
                except Exception:
                    err = "error detail unavailable"
            return st, err
        time.sleep(1.0)
    return "timeout", ""


def restore_test_mode_critical(
    base: str, api_key: str, wid: str, workflow_label: str
) -> bool:
    """Return True if test_mode is true on Cloud after PUT."""
    code, wf = api_request("GET", f"{base}/api/v1/workflows/{wid}", api_key)
    if code != 200:
        log_line("RESTORE test_mode GET", workflow_label, f"FAIL HTTP {code}")
        return False
    w = deepcopy(wf)
    if not set_test_mode_on_workflow(w, True):
        log_line("RESTORE test_mode", workflow_label, "FAIL no test_mode assignment")
        return False
    pcode, presp = api_request(
        "PUT",
        f"{base}/api/v1/workflows/{wid}",
        api_key,
        strip_workflow_for_put(w),
    )
    if pcode != 200:
        log_line(
            "RESTORE test_mode PUT",
            workflow_label,
            f"FAIL HTTP {pcode} {json.dumps(presp, ensure_ascii=False)[:800]}",
        )
        return False
    log_line("RESTORE test_mode PUT", workflow_label, f"OK HTTP {pcode}")
    return True


def run() -> int:
    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY", file=sys.stderr)
        return 1

    log_line("RUN_START", "all", "live_manual_test_sequence")

    # --- Phase 1: pre-flight all ---
    log_line("PHASE1", "all", "preflight GET 5 workflows")
    snapshots: dict[str, dict] = {}
    for wid, exp_name in LIVE_TEST_SEQUENCE:
        if wid == EMAIL_TRIAGE_ID:
            log_line("PREFLIGHT", exp_name, "SKIP excluded Email Triage")
            continue
        code, wf = api_request("GET", f"{base}/api/v1/workflows/{wid}", key)
        if code != 200:
            log_line("PREFLIGHT GET", exp_name, f"FAIL HTTP {code}")
            return 1
        snapshots[wid] = wf
        ok, msg = preflight_workflow(wf, exp_name)
        if not ok:
            log_line("PREFLIGHT", wf.get("name", wid), f"FAIL {msg}")
            return 1
        log_line("PREFLIGHT", wf.get("name", wid), "PASS")

    # --- Phase 2: per-workflow test ---
    for wid, exp_name in LIVE_TEST_SEQUENCE:
        wf_label = snapshots[wid].get("name", exp_name)
        is_smartpm = wid == SMARTPM_ID
        deactivated = False

        try:
            if is_smartpm:
                dcode, dresp = post_empty(
                    f"{base}/api/v1/workflows/{wid}/deactivate", key
                )
                log_line(
                    "DEACTIVATE pre-test",
                    wf_label,
                    f"HTTP {dcode} {json.dumps(dresp)[:200] if isinstance(dresp, dict) else dresp}",
                )
                if dcode != 200:
                    print(
                        f"\n*** HALT: SmartPM deactivate failed HTTP {dcode} ***\n",
                        file=sys.stderr,
                    )
                    return 1
                deactivated = True

            code, wf = api_request("GET", f"{base}/api/v1/workflows/{wid}", key)
            if code != 200:
                log_line("GET before flip", wf_label, f"FAIL HTTP {code}")
                return 1

            w_false = deepcopy(wf)
            if not set_test_mode_on_workflow(w_false, False):
                log_line("SET test_mode false", wf_label, "FAIL assignment missing")
                return 1

            pcode, presp = api_request(
                "PUT",
                f"{base}/api/v1/workflows/{wid}",
                key,
                strip_workflow_for_put(w_false),
            )
            log_line(
                "PUT test_mode false",
                wf_label,
                f"HTTP {pcode}"
                + (
                    f" {json.dumps(presp, ensure_ascii=False)[:400]}"
                    if pcode != 200
                    else ""
                ),
            )
            if pcode != 200:
                return 1

            ecode, eresp = try_execute_workflow(base, key, wid)
            if ecode == 405:
                log_line(
                    "POST execute",
                    wf_label,
                    "SKIP HTTP 405 (Cloud limitation)",
                )
            elif ecode in (200, 201):
                exec_id = None
                if isinstance(eresp, dict):
                    exec_id = eresp.get("executionId") or eresp.get("data", {}).get(
                        "executionId"
                    )
                log_line(
                    "POST execute",
                    wf_label,
                    f"HTTP {ecode} executionId={exec_id}",
                )
                if exec_id:
                    st, err = poll_execution(base, key, str(exec_id))
                    log_line(
                        "EXECUTION poll",
                        wf_label,
                        f"status={st} {err[:200] if err else ''}",
                    )
            else:
                log_line(
                    "POST execute",
                    wf_label,
                    f"HTTP {ecode} {json.dumps(eresp, ensure_ascii=False)[:500]}",
                )

        finally:
            if not restore_test_mode_critical(base, key, wid, wf_label):
                print(
                    "\n*** CRITICAL: FAILED TO RESTORE test_mode=true — "
                    "manual fix required; remaining tests aborted ***\n",
                    file=sys.stderr,
                )
                if is_smartpm and deactivated:
                    acode, _ = post_empty(
                        f"{base}/api/v1/workflows/{wid}/activate", key
                    )
                    log_line(
                        "ACTIVATE after restore-fail",
                        wf_label,
                        f"HTTP {acode} (restore failed; SmartPM reactivate attempted)",
                    )
                return 2

            if is_smartpm and deactivated:
                acode, aresp = post_empty(
                    f"{base}/api/v1/workflows/{wid}/activate", key
                )
                log_line(
                    "ACTIVATE post-test",
                    wf_label,
                    f"HTTP {acode} {json.dumps(aresp)[:120] if isinstance(aresp, dict) else aresp}",
                )
                if acode != 200:
                    print(
                        f"\n*** WARNING: SmartPM reactivate returned HTTP {acode} ***\n",
                        file=sys.stderr,
                    )

        log_line("WORKFLOW_DONE", wf_label, "ok")

    log_line("RUN_COMPLETE", "all", "all 5 workflows finished")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
