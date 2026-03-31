"""Shared n8n Cloud API helpers for Exsto workflow scripts."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from copy import deepcopy
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ENV_PATH = Path(r"C:\Exsto\.env")
BACKUP_DIR = Path(__file__).resolve().parent / "backups"
INJECT_REPORT_PATH = BACKUP_DIR / "_inject_report.json"


def load_cloud_credentials() -> tuple[str, str]:
    load_dotenv(ENV_PATH)
    base = (os.getenv("N8N_CLOUD_URL") or "").rstrip("/")
    key = os.getenv("N8N_CLOUD_API_KEY") or ""
    return base, key


def load_cloud_ui_login() -> tuple[str, str]:
    """Email + password for n8n Cloud UI (set N8N_CLOUD_EMAIL / N8N_CLOUD_PASSWORD in .env)."""
    load_dotenv(ENV_PATH)
    email = (os.getenv("N8N_CLOUD_EMAIL") or "").strip()
    password = (os.getenv("N8N_CLOUD_PASSWORD") or "").strip()
    return email, password


def find_test_payload_set(nodes: list[dict]) -> dict | None:
    for n in nodes:
        if n.get("type") != "n8n-nodes-base.set":
            continue
        name = n.get("name") or ""
        if name.startswith("Test Payload"):
            return n
    return None


def get_test_mode_from_workflow(wf: dict) -> bool | None:
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


def set_test_mode_api(workflow_id: str, value: bool) -> bool:
    """PUT workflow with Set node test_mode assignment updated."""
    base, key = load_cloud_credentials()
    if not base or not key:
        return False
    code, wf = api_request("GET", f"{base}/api/v1/workflows/{workflow_id}", key)
    if code != 200:
        return False
    w = deepcopy(wf)
    if not set_test_mode_on_workflow(w, value):
        return False
    pcode, _ = api_request(
        "PUT",
        f"{base}/api/v1/workflows/{workflow_id}",
        key,
        strip_workflow_for_put(w),
    )
    return pcode == 200


def restore_test_mode(workflow_id: str) -> bool:
    """Force test_mode=true via API (safe restore)."""
    return set_test_mode_api(workflow_id, True)


def verify_test_mode_true(workflow_id: str) -> bool:
    base, key = load_cloud_credentials()
    if not base or not key:
        return False
    code, wf = api_request("GET", f"{base}/api/v1/workflows/{workflow_id}", key)
    if code != 200:
        return False
    return get_test_mode_from_workflow(wf) is True


def workflow_deactivate(workflow_id: str) -> tuple[int, Any]:
    base, key = load_cloud_credentials()
    return api_request(
        "POST",
        f"{base}/api/v1/workflows/{workflow_id}/deactivate",
        key,
        {},
    )


def workflow_activate(workflow_id: str) -> tuple[int, Any]:
    base, key = load_cloud_credentials()
    return api_request(
        "POST",
        f"{base}/api/v1/workflows/{workflow_id}/activate",
        key,
        {},
    )


def fetch_latest_executions(workflow_id: str, limit: int = 5) -> tuple[int, Any]:
    base, key = load_cloud_credentials()
    q = urllib.parse.urlencode({"workflowId": workflow_id, "limit": str(limit)})
    return api_request("GET", f"{base}/api/v1/executions?{q}", key)


def strip_workflow_for_put(wf: dict) -> dict:
    """Match inject_manual_triggers.py — omit read-only root/node fields for PUT."""
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
        nodes.append({k: v for k, v in n.items() if k != "id"})
    out["nodes"] = nodes
    # n8n Cloud public API PUT rejects extra settings keys (e.g. callerPolicy, availableInMCP).
    raw = out.get("settings")
    eo = "v1"
    if isinstance(raw, dict) and raw.get("executionOrder"):
        eo = raw["executionOrder"]
    out["settings"] = {"executionOrder": eo}
    return out


def api_request(
    method: str, url: str, api_key: str, body: dict | None = None
) -> tuple[int, Any]:
    data = None
    headers = {
        "X-N8N-API-KEY": api_key,
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
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


def load_inject_report() -> list[dict[str, Any]]:
    if not INJECT_REPORT_PATH.is_file():
        raise FileNotFoundError(f"Missing {INJECT_REPORT_PATH}")
    data = json.loads(INJECT_REPORT_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("_inject_report.json must be a JSON array")
    return data


# Canonical 5 workflows: id must match Cloud; backup filename must appear in _inject_report.json
WORKFLOW_ID_BACKUP: list[dict[str, str]] = [
    {
        "id": "8Lg3lsjoraEUizfw",
        "backup": "Exsto_Cura_SmartPM_Market_Intelligence_Outreach_Agent_backup_20260329.json",
    },
    {
        "id": "DbRCcPqBatSFLR27",
        "backup": "Exsto_Cura_Invoice_Payment_Agent_backup_20260329.json",
    },
    {
        "id": "WVm9C69CVecMxh6c",
        "backup": "Exsto_Cura_Monthly_Report_Pipeline_Agent_backup_20260329.json",
    },
    {
        "id": "lqV394WRa4wPRCmd",
        "backup": "Exsto_Cura_Prospect_Intelligence_Agent_backup_20260329.json",
    },
    {
        "id": "TtSLiFqydMLODkHI",
        "backup": "Exsto_Cura_Weekly_Digest_backup_20260329.json",
    },
]

EMAIL_TRIAGE_ID = "5ZJ1NEIYpIUg2qDy"

MANUAL_TRIGGER_NAME = "Manual Trigger (Test)"
SET_NAME_PREFIX = "Test Payload —"
IF_GATE_NAME = "IF: test_mode?"
STOP_NODE_NAME = "Stop: TEST MODE ACTIVE"
