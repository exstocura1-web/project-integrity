#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Inject IF: test_mode? + Stop: TEST MODE ACTIVE between Test Payload Set and downstream.

Prerequisites:
  - _inject_report.json + pre-inject backup_20260329.json files present
  - Manual Trigger + Test Payload Set already on Cloud (prior inject)

Usage:
  cd C:\\Exsto\\n8n-workflows && python inject_test_mode_gates.py
"""
from __future__ import annotations

import json
import re
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from n8n_workflow_common import (
    BACKUP_DIR,
    IF_GATE_NAME,
    INJECT_REPORT_PATH,
    MANUAL_TRIGGER_NAME,
    STOP_NODE_NAME,
    WORKFLOW_ID_BACKUP,
    api_request,
    load_cloud_credentials,
    load_inject_report,
    strip_workflow_for_put,
)


def post_inject_filename(wf_name: str) -> str:
    n = wf_name.replace("\u2014", " ").replace("—", " ")
    n = re.sub(r"[^0-9A-Za-z]+", "_", n)
    n = re.sub(r"_+", "_", n).strip("_")
    return f"{n}_post-inject_20260329.json"


def find_test_payload_set(nodes: list[dict]) -> dict | None:
    for n in nodes:
        if n.get("type") != "n8n-nodes-base.set":
            continue
        name = n.get("name") or ""
        if name.startswith("Test Payload"):
            return n
    return None


def build_if_node(pos: list[float]) -> dict[str, Any]:
    return {
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "typeValidation": "strict",
                },
                "conditions": [
                    {
                        "id": "test_mode_check",
                        "leftValue": "={{ $json.test_mode }}",
                        "rightValue": True,
                        "operator": {
                            "type": "boolean",
                            "operation": "equals",
                        },
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "name": IF_GATE_NAME,
        "position": pos,
        "notes": (
            "TRUE = test mode, routes to Stop node. FALSE = live run, "
            "routes to production path."
        ),
    }


def build_stop_node(pos: list[float]) -> dict[str, Any]:
    return {
        "parameters": {
            "errorType": "errorMessage",
            "errorMessage": (
                "TEST MODE ACTIVE — live execution blocked. "
                "Set test_mode: false in the Set node to run production path."
            ),
        },
        "type": "n8n-nodes-base.stopAndError",
        "typeVersion": 1,
        "name": STOP_NODE_NAME,
        "position": pos,
        "notes": (
            "Intentional block. Remove Manual Trigger path when promoting to production."
        ),
    }


def inject_gates(wf: dict) -> dict:
    nodes = wf.get("nodes") or []
    connections = wf.get("connections") or {}
    if not isinstance(connections, dict):
        raise ValueError("invalid connections")

    names = {n["name"] for n in nodes}

    if IF_GATE_NAME in names:
        raise RuntimeError("already_gated")

    if MANUAL_TRIGGER_NAME not in names:
        raise RuntimeError(f"missing {MANUAL_TRIGGER_NAME!r}")

    set_node = find_test_payload_set(nodes)
    if not set_node:
        raise RuntimeError("missing Test Payload Set node")

    set_name = set_node["name"]
    spos = set_node.get("position") or [0, 0]
    sx, sy = float(spos[0]), float(spos[1])
    if_pos = [sx + 200, sy]
    stop_pos = [if_pos[0] + 200, if_pos[1] - 120]

    block = connections.get(set_name)
    if not block or "main" not in block or not block["main"] or not block["main"][0]:
        raise RuntimeError(f"no outgoing connection from Set {set_name!r}")

    link = block["main"][0][0]
    downstream = link.get("node")
    d_idx = link.get("index", 0)
    if not downstream:
        raise RuntimeError("could not resolve downstream from Set")

    new_conn = deepcopy(connections)
    new_conn[set_name] = {
        "main": [[{"node": IF_GATE_NAME, "type": "main", "index": 0}]]
    }
    new_conn[IF_GATE_NAME] = {
        "main": [
            [{"node": STOP_NODE_NAME, "type": "main", "index": 0}],
            [{"node": downstream, "type": "main", "index": d_idx}],
        ]
    }

    new_nodes = list(nodes) + [
        build_if_node(if_pos),
        build_stop_node(stop_pos),
    ]

    out = deepcopy(wf)
    out["nodes"] = new_nodes
    out["connections"] = new_conn
    return out


def put_workflow(base: str, key: str, wid: str, body: dict) -> tuple[int, Any]:
    return api_request("PUT", f"{base}/api/v1/workflows/{wid}", key, body)


def main() -> int:
    try:
        report = load_inject_report()
    except Exception as e:
        print(f"Halt: {e}", file=sys.stderr)
        return 1

    reported = {row.get("backup") for row in report if isinstance(row, dict)}
    for row in WORKFLOW_ID_BACKUP:
        if row["backup"] not in reported:
            print(f"Halt: backup {row['backup']!r} missing from _inject_report.json", file=sys.stderr)
            return 1
        pre_path = BACKUP_DIR / row["backup"]
        if not pre_path.is_file():
            print(f"Halt: pre-inject backup missing: {pre_path}", file=sys.stderr)
            return 1

    base, key = load_cloud_credentials()
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY", file=sys.stderr)
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []

    for row in WORKFLOW_ID_BACKUP:
        wid = row["id"]
        code, wf = api_request("GET", f"{base}/api/v1/workflows/{wid}", key)
        if code != 200:
            print(f"[FAIL] GET {wid} HTTP {code} {wf}", file=sys.stderr)
            return 1

        name = wf.get("name", wid)
        post_name = post_inject_filename(name)
        post_path = BACKUP_DIR / post_name

        post_path.write_text(
            json.dumps(wf, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"[OK] Post-inject backup: {post_name}")

        node_names = {n["name"] for n in (wf.get("nodes") or [])}

        try:
            gated = inject_gates(wf)
        except RuntimeError as e:
            msg = str(e)
            if msg == "already_gated":
                print(f"[SKIP] {name} — already gated")
                results.append(
                    {
                        "workflow": name,
                        "pre_gate_backup": post_name,
                        "if_injected": False,
                        "stop_injected": False,
                        "rewired": False,
                        "put_status": "skipped",
                        "note": "already gated",
                    }
                )
                continue
            print(f"[ERROR] {name}: {msg}", file=sys.stderr)
            results.append(
                {
                    "workflow": name,
                    "pre_gate_backup": post_name,
                    "if_injected": False,
                    "stop_injected": False,
                    "rewired": False,
                    "put_status": "error",
                    "note": msg,
                }
            )
            continue

        put_body = strip_workflow_for_put(gated)
        pcode, presp = put_workflow(base, key, wid, put_body)

        if pcode != 200:
            body_txt = json.dumps(presp, ensure_ascii=False)
            print(f"[FAIL] PUT {name} HTTP {pcode}\n{body_txt}", file=sys.stderr)
            rollback = json.loads(post_path.read_text(encoding="utf-8"))
            rcode, rresp = put_workflow(
                base, key, wid, strip_workflow_for_put(rollback)
            )
            print(
                f"[ROLLBACK] PUT pre-gate snapshot HTTP {rcode} "
                f"{'OK' if rcode == 200 else 'FAIL'}",
                file=sys.stderr,
            )
            if rcode != 200:
                print(json.dumps(rresp, ensure_ascii=False), file=sys.stderr)
            return 1

        print(f"[OK] PUT gated workflow {name} HTTP {pcode}")
        sched = next(
            (n for n in wf["nodes"] if n.get("type") == "n8n-nodes-base.scheduleTrigger"),
            None,
        )
        sname = sched["name"] if sched else "?"
        set_n = find_test_payload_set(wf["nodes"] or [])
        set_nm = set_n["name"] if set_n else "?"
        block = (wf.get("connections") or {}).get(set_nm) or {}
        down = "?"
        try:
            down = block["main"][0][0]["node"]
        except (KeyError, IndexError, TypeError):
            pass

        results.append(
            {
                "workflow": name,
                "pre_gate_backup": post_name,
                "if_injected": True,
                "stop_injected": True,
                "rewired": True,
                "put_status": f"HTTP {pcode}",
                "schedule_trigger": sname,
                "set_node": set_nm,
                "first_downstream": down,
            }
        )

    out_path = BACKUP_DIR / "_gate_injection_report.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nReport written: {out_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
