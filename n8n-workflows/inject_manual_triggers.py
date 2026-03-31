#!/usr/bin/env python3
"""
Backup 5 schedule-only workflows and inject Manual Trigger + Set (test payload).
Uses N8N_CLOUD_URL + N8N_CLOUD_API_KEY from C:\\Exsto\\.env
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ENV_PATH = Path(r"C:\Exsto\.env")
BACKUP_DIR = Path(r"C:\Exsto\n8n-workflows\backups")

WORKFLOWS: list[dict[str, Any]] = [
    {
        "id": "8Lg3lsjoraEUizfw",
        "backup_file": "Exsto_Cura_SmartPM_Market_Intelligence_Outreach_Agent_backup_20260329.json",
        "set_short": "SmartPM",
        "payload": {
            "signal_type": "competitor_activity",
            "entity": "SmartPM Technologies",
            "event": "New HVDC case study published",
            "source": "LinkedIn",
            "relevance_score": 0.92,
            "test_mode": True,
        },
    },
    {
        "id": "DbRCcPqBatSFLR27",
        "backup_file": "Exsto_Cura_Invoice_Payment_Agent_backup_20260329.json",
        "set_short": "Invoice",
        "payload": {
            "vendor": "NKT Cables GmbH",
            "invoice_number": "NKT-2026-0441",
            "amount": 142500.00,
            "currency": "USD",
            "due_date": "2026-04-15",
            "project": "CHPE",
            "test_mode": True,
        },
    },
    {
        "id": "WVm9C69CVecMxh6c",
        "backup_file": "Exsto_Cura_Monthly_Report_Pipeline_Agent_backup_20260329.json",
        "set_short": "Monthly Report",
        "payload": {
            "reporting_period": "March 2026",
            "project": "CHPE",
            "trigger": "month_end",
            "include_tia": True,
            "test_mode": True,
        },
    },
    {
        "id": "lqV394WRa4wPRCmd",
        "backup_file": "Exsto_Cura_Prospect_Intelligence_Agent_backup_20260329.json",
        "set_short": "Prospect Intel",
        "payload": {
            "company": "Transmission Developers Inc",
            "contact": "Scott [TDI]",
            "source": "Direct Referral",
            "engagement_type": "AI Project Controls Demo",
            "priority": "HIGH",
            "test_mode": True,
        },
    },
    {
        "id": "TtSLiFqydMLODkHI",
        "backup_file": "Exsto_Cura_Weekly_Digest_backup_20260329.json",
        "set_short": "Weekly Digest",
        "payload": {
            "week": "2026-W13",
            "trigger": "scheduled_digest",
            "include_bd": True,
            "include_ops": True,
            "test_mode": True,
        },
    },
]

MANUAL_NAME = "Manual Trigger (Test)"


def read_env() -> dict[str, str]:
    raw = ENV_PATH.read_text(encoding="utf-8", errors="replace")
    out: dict[str, str] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def api_request(method: str, url: str, api_key: str, body: dict | None = None) -> tuple[int, Any]:
    data = None
    headers = {
        "X-N8N-API-KEY": api_key,
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            code = resp.getcode()
            txt = resp.read().decode("utf-8")
            return code, json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(txt) if txt else {}
        except json.JSONDecodeError:
            parsed = {"raw": txt}
        return e.code, parsed


def py_type_to_assignment(name: str, value: Any, idx: int) -> dict[str, Any]:
    if isinstance(value, bool):
        t = "boolean"
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        t = "number"
    else:
        t = "string"
        value = str(value)
    return {"id": str(idx), "name": name, "value": value, "type": t}


def build_set_node(set_name: str, payload: dict[str, Any], pos: list[float]) -> dict[str, Any]:
    assignments = [
        py_type_to_assignment(k, v, i + 1) for i, (k, v) in enumerate(payload.items())
    ]
    return {
        "parameters": {
            "mode": "manual",
            "assignments": {"assignments": assignments},
            "options": {},
        },
        "type": "n8n-nodes-base.set",
        "typeVersion": 3.4,
        "name": set_name,
        "position": pos,
        "notes": "REMOVE BEFORE PRODUCTION — test injection node",
    }


def build_manual_node(pos: list[float]) -> dict[str, Any]:
    return {
        "parameters": {},
        "type": "n8n-nodes-base.manualTrigger",
        "typeVersion": 1,
        "position": pos,
        "name": MANUAL_NAME,
    }


def find_schedule_node(nodes: list[dict]) -> dict | None:
    for n in nodes:
        if n.get("type") == "n8n-nodes-base.scheduleTrigger":
            return n
    return None


def first_downstream(connections: dict, schedule_name: str) -> tuple[str, int] | None:
    block = connections.get(schedule_name)
    if not block or "main" not in block:
        return None
    main = block["main"]
    if not main or not main[0]:
        return None
    link = main[0][0]
    return link.get("node"), link.get("index", 0)


def strip_workflow_for_put(wf: dict) -> dict:
    remove_root = {
        "id",
        "createdAt",
        "updatedAt",
        "active",
        "versionId",
        "activeVersionId",
        "versionCounter",
        "triggerCount",
        "tags",
        "pinData",
        "shared",
        "meta",
        "isArchived",
        "activeVersion",
        "description",
        "staticData",
    }
    out = {k: v for k, v in wf.items() if k not in remove_root}
    nodes = []
    for n in out.get("nodes", []):
        nn = {k: v for k, v in n.items() if k != "id"}
        nodes.append(nn)
    out["nodes"] = nodes
    raw = out.get("settings")
    eo = "v1"
    if isinstance(raw, dict) and raw.get("executionOrder"):
        eo = raw["executionOrder"]
    out["settings"] = {"executionOrder": eo}
    return out


def inject(wf: dict, set_short: str, payload: dict) -> dict:
    nodes = wf.get("nodes", [])
    connections = wf.get("connections") or {}
    if not isinstance(connections, dict):
        raise ValueError("connections must be a dict")

    names = {n["name"] for n in nodes}
    if MANUAL_NAME in names:
        raise RuntimeError(f"Workflow already has '{MANUAL_NAME}' — abort additive-only rule")

    sched = find_schedule_node(nodes)
    if not sched:
        raise RuntimeError("No scheduleTrigger node found")

    sched_name = sched["name"]
    pos = sched.get("position") or [0, 0]
    if not isinstance(pos, list) or len(pos) < 2:
        pos = [0, 0]
    sx, sy = float(pos[0]), float(pos[1])
    manual_pos = [sx - 200, sy - 80]
    set_pos = [sx - 200, sy + 80]

    down = first_downstream(connections, sched_name)
    if not down:
        raise RuntimeError(f"No downstream from schedule '{sched_name}'")

    downstream_name, downstream_index = down
    set_name = f"Test Payload — {set_short}"

    if set_name in names:
        raise RuntimeError(f"Node name collision: {set_name}")

    manual = build_manual_node(manual_pos)
    set_node = build_set_node(set_name, payload, set_pos)

    new_nodes = nodes + [manual, set_node]
    wf["nodes"] = new_nodes

    # Deep copy connections — add parallel path
    new_conn = json.loads(json.dumps(connections))
    new_conn[MANUAL_NAME] = {"main": [[{"node": set_name, "type": "main", "index": 0}]]}
    new_conn[set_name] = {
        "main": [[{"node": downstream_name, "type": "main", "index": downstream_index}]]
    }
    wf["connections"] = new_conn
    return wf


def main() -> int:
    env = read_env()
    base = (env.get("N8N_CLOUD_URL") or "").rstrip("/")
    key = env.get("N8N_CLOUD_API_KEY") or ""
    if not base or not key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY in .env", file=sys.stderr)
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # Phase 1: backup only
    backups_ok: list[str] = []
    for spec in WORKFLOWS:
        wid = spec["id"]
        path = BACKUP_DIR / spec["backup_file"]
        code, data = api_request("GET", f"{base}/api/v1/workflows/{wid}", key)
        if code != 200:
            print(f"GET failed {wid}: HTTP {code} {data}", file=sys.stderr)
            return 1
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        backups_ok.append(str(path))
        print(f"[OK] Backup {path.name} ({len(path.read_text(encoding='utf-8'))} bytes)")

    print("\n--- Phase 2–6: inject + PUT ---\n")
    report_rows: list[dict[str, Any]] = []

    for spec in WORKFLOWS:
        wid = spec["id"]
        path = BACKUP_DIR / spec["backup_file"]
        wf = json.loads(path.read_text(encoding="utf-8"))
        name = wf.get("name", wid)

        try:
            modified = inject(json.loads(json.dumps(wf)), spec["set_short"], spec["payload"])
        except Exception as e:
            print(f"[FAIL] {name}: {e}", file=sys.stderr)
            return 1

        put_body = strip_workflow_for_put(modified)
        code, resp = api_request(
            "PUT", f"{base}/api/v1/workflows/{wid}", key, put_body
        )
        ok = code == 200
        if not ok:
            print(f"[FAIL] PUT {name}: HTTP {code} {resp}", file=sys.stderr)
            return 1

        sched = find_schedule_node(wf["nodes"])
        pos = sched.get("position", [0, 0]) if sched else [0, 0]
        report_rows.append(
            {
                "workflow": name,
                "backup": spec["backup_file"],
                "put_http": code,
                "manual_pos": [pos[0] - 200, pos[1] - 80] if len(pos) >= 2 else None,
                "set_pos": [pos[0] - 200, pos[1] + 80] if len(pos) >= 2 else None,
            }
        )
        print(f"[OK] PUT {name} HTTP {code}")

    (BACKUP_DIR / "_inject_report.json").write_text(
        json.dumps(report_rows, indent=2), encoding="utf-8"
    )
    print("\nDone. Report: backups\\_inject_report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
