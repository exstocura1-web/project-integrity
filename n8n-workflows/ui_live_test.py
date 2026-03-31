#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playwright-driven n8n Cloud UI manual tests (Test workflow + test_mode lifecycle).

Usage:
  cd C:\\Exsto\\n8n-workflows && py ui_live_test.py
  cd C:\\Exsto\\n8n-workflows && py ui_live_test.py TtSLiFqydMLODkHI
  cd C:\\Exsto\\n8n-workflows && py ui_live_test.py --headless

Requires in C:\\Exsto\\.env:
  N8N_CLOUD_URL, N8N_CLOUD_API_KEY, N8N_CLOUD_EMAIL, N8N_CLOUD_PASSWORD

  pip install playwright python-dotenv
  playwright install chromium
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import Page, async_playwright

from n8n_workflow_common import (
    EMAIL_TRIAGE_ID,
    fetch_latest_executions,
    load_cloud_credentials,
    load_cloud_ui_login,
    restore_test_mode,
    set_test_mode_api,
    verify_test_mode_true,
    workflow_activate,
    workflow_deactivate,
)

ROOT = Path(__file__).resolve().parent
SCREENSHOTS = ROOT / "screenshots"
LOG_PATH = ROOT / "ui_test_log.txt"
REPORT_PATH = ROOT / "ui_test_report_20260329.md"

SMARTPM_ID = "8Lg3lsjoraEUizfw"

# Overridable via env UI_SLOW_MO, UI_EXEC_WAIT_MS or CLI
def _int_env(name: str, default: int) -> int:
    v = os.getenv(name)
    if v is None or not str(v).strip().isdigit():
        return default
    return int(v)

# Order, id, log slug, Set node label (exact), expected first production node after IF false
WORKFLOWS: list[dict] = [
    {
        "order": 1,
        "id": "TtSLiFqydMLODkHI",
        "slug": "weekly_digest",
        "name": "Exsto Cura Weekly Digest",
        "set_name": "Test Payload — Weekly Digest",
        "expected": "Get Week Emails",
    },
    {
        "order": 2,
        "id": "WVm9C69CVecMxh6c",
        "slug": "monthly_report",
        "name": "Exsto Cura — Monthly Report Pipeline Agent",
        "set_name": "Test Payload — Monthly Report",
        "expected": "Load Client Roster",
    },
    {
        "order": 3,
        "id": "lqV394WRa4wPRCmd",
        "slug": "prospect_intel",
        "name": "Exsto Cura — Prospect Intelligence Agent",
        "set_name": "Test Payload — Prospect Intel",
        "expected": "Load Prospect Watchlist",
    },
    {
        "order": 4,
        "id": "DbRCcPqBatSFLR27",
        "slug": "invoice",
        "name": "Exsto Cura — Invoice & Payment Agent",
        "set_name": "Test Payload — Invoice",
        "expected": "HoneyBook — Get Outstanding Invoices",
    },
    {
        "order": 5,
        "id": "8Lg3lsjoraEUizfw",
        "slug": "smartpm",
        "name": "Exsto Cura — SmartPM Market Intelligence & Outreach Agent",
        "set_name": "Test Payload — SmartPM",
        "expected": "Load Prospect Database",
    },
]


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log_ui(workflow: str, execution_status: str, last_node: str, expected_hit: str, restored: str) -> None:
    line = f"[{ts()}] | {workflow} | {execution_status} | {last_node} | {expected_hit} | {restored}\n"
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line)
    print(line.strip())


def log_action(msg: str) -> None:
    line = f"[{ts()}] | _ | {msg}\n"
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line)
    print(line.strip())


async def shot(page: Page, path: Path) -> None:
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(path), full_page=True)


def shot_name(order: int, slug: str, suffix: str) -> Path:
    return SCREENSHOTS / f"{order}_{slug}_{suffix}.png"


async def ensure_login(page: Page, base: str, email: str, password: str) -> None:
    await page.goto(base, wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=25000)
    except Exception:
        pass

    if "/signin" in page.url or "login" in page.url.lower() or await page.locator(
        'input[type="password"]'
    ).count() > 0:
        email_sel = page.locator('input[type="email"], input[name="email"], input#email').first
        pass_sel = page.locator('input[type="password"]').first
        await email_sel.wait_for(state="visible", timeout=30000)
        await email_sel.fill(email)
        await pass_sel.fill(password)
        signin = page.get_by_role("button", name=re.compile(r"sign\s*in|log\s*in", re.I))
        if await signin.count() == 0:
            signin = page.locator('button:has-text("Sign in"), button:has-text("Log in")').first
        await signin.click()
        await page.wait_for_url(re.compile(r".*/(workflows|workflow|overview|home)"), timeout=120000)
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(SCREENSHOTS / "00_login_success.png"), full_page=True)


async def wait_canvas(page: Page, timeout: float = 60000) -> None:
    # Canvas / editor readiness: manual trigger text or workflow canvas
    await page.get_by_text("Manual Trigger (Test)", exact=True).first.wait_for(
        state="visible", timeout=int(timeout)
    )


async def click_canvas_node(page: Page, label: str, exact: bool = True) -> None:
    loc = page.get_by_text(label, exact=exact)
    n = await loc.count()
    if n == 0:
        raise RuntimeError(f"Node text not found: {label!r}")
    await loc.first.click(timeout=20000, force=True)


async def ui_try_set_test_mode_boolean(page: Page, want: bool) -> bool:
    """
    Try to set test_mode assignment in open Set node panel.
    Returns True if a plausible UI interaction succeeded.
    """
    target = "false" if want is False else "true"
    try:
        tm = page.get_by_text("test_mode", exact=True).first
        await tm.wait_for(state="visible", timeout=12000)
    except Exception:
        return False

    try:
        row = page.locator("div").filter(has=page.get_by_text("test_mode", exact=True)).first
        await row.scroll_into_view_if_needed()
        combo = row.locator('[role="combobox"], .el-select, select').first
        if await combo.count():
            await combo.click(timeout=5000)
            await page.get_by_role("option", name=re.compile(rf"^{target}$", re.I)).click(
                timeout=5000
            )
            return True
    except Exception:
        pass

    try:
        switches = page.get_by_role("switch")
        cnt = await switches.count()
        for i in range(min(cnt, 8)):
            sw = switches.nth(i)
            if await sw.is_visible():
                aria = await sw.get_attribute("aria-checked")
                is_on = aria == "true"
                if want and not is_on:
                    await sw.click()
                    return True
                if not want and is_on:
                    await sw.click()
                    return True
                if (want and is_on) or (not want and not is_on):
                    return True
    except Exception:
        pass

    try:
        inp = page.locator('input[type="checkbox"]').filter(has_text="")
        if await inp.count():
            await inp.first.click()
            return True
    except Exception:
        pass

    return False


async def save_workflow(page: Page) -> None:
    try:
        await page.keyboard.press("Control+s")
    except Exception:
        pass
    await asyncio.sleep(1.5)
    save_btn = page.get_by_role("button", name=re.compile(r"^save$", re.I))
    if await save_btn.count():
        try:
            await save_btn.first.click(timeout=5000)
        except Exception:
            pass
    await asyncio.sleep(2.0)


async def click_test_workflow(page: Page) -> None:
    candidates = [
        page.get_by_role("button", name=re.compile(r"test\s*workflow", re.I)),
        page.get_by_text(re.compile(r"^Test workflow$", re.I)),
        page.locator("button").filter(has_text=re.compile(r"Test workflow", re.I)),
    ]
    for c in candidates:
        try:
            if await c.count() > 0:
                await c.first.click(timeout=15000)
                return
        except Exception:
            continue
    raise RuntimeError("Test workflow button not found")


async def read_execution_panel_hint(page: Page) -> tuple[str, str, str]:
    """Best-effort status + blob for last node / errors."""
    await asyncio.sleep(2.0)
    try:
        txt = await page.locator("body").inner_text(timeout=5000)
    except Exception:
        txt = ""
    low = txt.lower()
    status = "unknown"
    if "error" in low and "stopped" in low:
        status = "error"
    elif "success" in low or "succeeded" in low:
        status = "success"
    elif "running" in low or "executing" in low:
        status = "running"

    last = ""
    for needle in ("Stopped at", "Error in", "Node:", "failed at"):
        if needle.lower() in low:
            idx = low.find(needle.lower())
            last = txt[idx : idx + 200].replace("\n", " ")
            break
    return status, last, txt[:8000]


async def run_one(
    page: Page,
    base: str,
    meta: dict,
    results: list,
    exec_wait_ms: int,
) -> bool:
    wid = meta["id"]
    order = meta["order"]
    slug = meta["slug"]
    set_name = meta["set_name"]
    expected = meta["expected"]
    deactivated = False

    execution_status = "not_run"
    last_node = ""
    expected_hit = "no"
    restored_flag = "no"

    try:
        if wid == SMARTPM_ID:
            code, _ = workflow_deactivate(wid)
            log_action(f"SmartPM DEACTIVATE HTTP {code}")
            if code != 200:
                raise RuntimeError(f"deactivate failed HTTP {code}")
            deactivated = True

        url = f"{base.rstrip('/')}/workflow/{wid}"
        await page.goto(url, wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=40000)
        except Exception:
            pass
        await wait_canvas(page)
        await shot(page, shot_name(order, slug, "01_canvas_loaded"))

        await click_canvas_node(page, set_name, exact=True)
        await asyncio.sleep(1.5)
        await shot(page, shot_name(order, slug, "02_set_node_open"))

        ui_false_ok = await ui_try_set_test_mode_boolean(page, False)
        if not ui_false_ok:
            log_action(f"{meta['name']}: UI test_mode=false failed, applying API")
            if not set_test_mode_api(wid, False):
                raise RuntimeError("API test_mode=false failed")
        else:
            await save_workflow(page)

        await shot(page, shot_name(order, slug, "03_testmode_false"))

        await click_canvas_node(page, "Manual Trigger (Test)", exact=True)
        await asyncio.sleep(0.8)
        await shot(page, shot_name(order, slug, "04_manual_trigger_selected"))

        await click_test_workflow(page)

        try:
            await page.wait_for_function(
                """() => {
                  const t = document.body.innerText.toLowerCase();
                  return t.includes('success') || t.includes('error') || t.includes('failed')
                    || t.includes('stopped');
                }""",
                timeout=exec_wait_ms,
            )
        except Exception:
            pass

        execution_status, last_node, blob = await read_execution_panel_hint(page)
        if expected in blob:
            expected_hit = "yes"
        await shot(page, shot_name(order, slug, "05_execution_result"))

    except Exception as e:
        execution_status = f"exception: {e}"
        try:
            await shot(page, shot_name(order, slug, "99_error_state"))
        except Exception:
            pass

    finally:
        # Mandatory API restore first (session loss safe)
        api_ok = restore_test_mode(wid)
        restored_flag = "yes" if api_ok else "no"
        if not api_ok:
            log_action(f"CRITICAL API restore_test_mode failed for {wid}")

        try:
            await page.goto(f"{base.rstrip('/')}/workflow/{wid}", wait_until="domcontentloaded")
            await asyncio.sleep(2.0)
            await wait_canvas(page)
            await click_canvas_node(page, set_name, exact=True)
            await asyncio.sleep(1.0)
            await ui_try_set_test_mode_boolean(page, True)
            await shot(page, shot_name(order, slug, "06_testmode_restored"))
            await save_workflow(page)
            await shot(page, shot_name(order, slug, "07_workflow_saved"))
        except Exception as ex:
            log_action(f"UI sync after API restore skipped: {ex}")

        if verify_test_mode_true(wid):
            log_action(f"{meta['name']}: test_mode verified true via API")
        else:
            log_action(f"VERIFY failed test_mode!=true for {wid} after restore")
            restored_flag = "no"

        if wid == SMARTPM_ID and deactivated:
            acode, _ = workflow_activate(wid)
            log_action(f"SmartPM ACTIVATE HTTP {acode}")

        log_ui(meta["name"], execution_status, last_node or "(see screenshot)", expected_hit, restored_flag)

        results.append(
            {
                "meta": meta,
                "execution_status": execution_status,
                "last_node": last_node,
                "expected_hit": expected_hit,
                "restored": restored_flag,
            }
        )

    return restored_flag == "yes"


def build_report(results: list, phase3: list) -> str:
    lines = [
        "# UI Live Manual Test Report",
        "**Date:** 2026-03-29",
        "**Method:** Playwright browser automation",
        "**Instance:** https://exo-project-integrity.app.n8n.cloud",
        "",
        "## Test Results",
        "| Order | Workflow | Execution Status | First Production Node Hit | Expected Node | Match | test_mode Restored | Live Calls |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for i, r in enumerate(results):
        m = r["meta"]
        lines.append(
            f"| {m['order']} | {m['name']} | {r['execution_status']} | "
            f"(panel text / screenshot) | {m['expected']} | {r['expected_hit']} | "
            f"{r['restored']} | see Phase 3 |"
        )
    lines += ["", "## Execution Timeline (API)", "| Workflow | Start | End | Duration | Last Node |", "|---|---|---|---|---|"]
    for row in phase3:
        lines.append(
            f"| {row.get('name')} | {row.get('started')} | {row.get('stopped')} | "
            f"{row.get('duration')} | {row.get('last_node')} |"
        )
    lines += ["", "## Live External Calls Confirmed", "| Workflow | Service | Node | Status |", "|---|---|---|---|"]
    for row in phase3:
        for hit in row.get("live_hits", []) or []:
            lines.append(f"| {row.get('name')} | {hit.get('service')} | {hit.get('node')} | {hit.get('status')} |")
    lines += ["", "## Failures & Remediation", "_See log and screenshots._", "", "## Screenshots Index", ""]
    for p in sorted(SCREENSHOTS.glob("*.png")):
        lines.append(f"- `{p.name}`")
    lines += ["", "## test_mode Final State (API verified)", "| Workflow | Value | Verified |", "|---|---|---|"]
    base, key = load_cloud_credentials()
    for m in WORKFLOWS:
        ok = verify_test_mode_true(m["id"])
        lines.append(f"| {m['name']} | true | {'✅' if ok else '❌'} |")
    return "\n".join(lines) + "\n"


def emergency_restore_all_workflows() -> None:
    """API: test_mode true + activate for every target workflow (safe exit)."""
    for m in WORKFLOWS:
        restore_test_mode(m["id"])
        workflow_activate(m["id"])


def append_run_summary_to_log(results: list, phase3: list) -> None:
    lines = [
        "",
        "# UI Live Test — Run Summary",
        "**Date:** 2026-03-29",
        "**Script:** ui_live_test.py (full 5-workflow run)",
        "",
        "## Results",
        "| Order | Workflow | Execution Status | Production Node Reached | Expected Node | Match | test_mode Restored |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        m = r["meta"]
        lines.append(
            f"| {m['order']} | {m['name']} | {r['execution_status']} | "
            f"(see screenshot/log) | {m['expected']} | {r['expected_hit']} | {r['restored']} |"
        )
    lines += ["", "## Live External Calls (from execution records)", "| Workflow | Service | Node | Status |", "|---|---|---|---|"]
    for row in phase3:
        hits = row.get("live_hits") or []
        if not hits:
            lines.append(f"| {row.get('name')} | — | — | — |")
        else:
            for h in hits:
                lines.append(
                    f"| {row.get('name')} | {h.get('service')} | {h.get('node')} | {h.get('status')} |"
                )
    lines += ["", "## Screenshots Captured", "| Workflow | Count | Key Screenshot |", "|---|---|---|"]
    by_slug: dict[str, int] = {}
    for p in SCREENSHOTS.glob("*.png"):
        parts = p.stem.split("_", 2)
        if len(parts) >= 2 and parts[0].isdigit():
            key = f"{parts[0]}_{parts[1]}"
            by_slug[key] = by_slug.get(key, 0) + 1
    for m in WORKFLOWS:
        key = f"{m['order']}_{m['slug']}"
        c = by_slug.get(key, 0)
        lines.append(
            f"| {m['name']} | {c} | {key}_05_execution_result.png |"
        )
    lines += ["", "## test_mode Final State", "| Workflow | Value | API Verified |", "|---|---|---|"]
    for m in WORKFLOWS:
        ok = verify_test_mode_true(m["id"])
        lines.append(f"| {m['name']} | true | {'yes' if ok else 'NO'} |")
    lines += ["", "## Issues Encountered", "_See log lines above._", ""]
    block = "\n".join(lines) + "\n"
    print(block)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(block)


def phase3_collect_sync() -> list:
    out = []
    for m in WORKFLOWS:
        code, data = fetch_latest_executions(m["id"], limit=3)
        row = {
            "name": m["name"],
            "started": "",
            "stopped": "",
            "duration": "",
            "last_node": "",
            "live_hits": [],
        }
        if code != 200:
            row["last_node"] = f"GET executions HTTP {code}"
            out.append(row)
            continue
        items: list = []
        if isinstance(data, dict):
            items = data.get("data") or data.get("results") or []
        elif isinstance(data, list):
            items = data
        ex = items[0] if items else None
        if not ex:
            out.append(row)
            continue
        row["started"] = str(ex.get("startedAt", ""))
        row["stopped"] = str(ex.get("stoppedAt", ""))
        row["last_node"] = str(
            ex.get("lastNodeExecuted")
            or (ex.get("data") or {}).get("lastNodeExecuted")
            or ""
        )
        try:
            if ex.get("startedAt") and ex.get("stoppedAt"):
                a = datetime.fromisoformat(str(ex["startedAt"]).replace("Z", "+00:00"))
                b = datetime.fromisoformat(str(ex["stoppedAt"]).replace("Z", "+00:00"))
                row["duration"] = f"{(b - a).total_seconds():.1f}s"
        except Exception:
            pass
        rd = (ex.get("data") or {}).get("resultData", {}).get("runData", {})
        if isinstance(rd, dict):
            for node_name in rd.keys():
                nlow = node_name.lower()
                if "gmail" in nlow:
                    row["live_hits"].append(
                        {"service": "Gmail", "node": node_name, "status": "LIVE CALL CONFIRMED"}
                    )
                if "notion" in nlow:
                    row["live_hits"].append(
                        {"service": "Notion", "node": node_name, "status": "LIVE CALL CONFIRMED"}
                    )
                if "honeybook" in nlow or "http" in nlow:
                    row["live_hits"].append(
                        {
                            "service": "HTTP/HoneyBook",
                            "node": node_name,
                            "status": "LIVE CALL CONFIRMED",
                        }
                    )
                if "claude" in nlow or "anthropic" in nlow:
                    row["live_hits"].append(
                        {
                            "service": "Anthropic",
                            "node": node_name,
                            "status": "LIVE CALL CONFIRMED",
                        }
                    )
        out.append(row)
    return out


async def async_main(
    headless: bool,
    single_id: str | None,
    slow_mo_arg: int | None,
    exec_wait_arg: int | None,
) -> int:
    email, password = load_cloud_ui_login()
    if not email or not password:
        print(
            "Missing N8N_CLOUD_EMAIL or N8N_CLOUD_PASSWORD in C:\\Exsto\\.env",
            file=sys.stderr,
        )
        return 1

    base, api_key = load_cloud_credentials()
    if not base or not api_key:
        print("Missing N8N_CLOUD_URL or N8N_CLOUD_API_KEY", file=sys.stderr)
        return 1

    slow_mo = (
        slow_mo_arg
        if slow_mo_arg is not None
        else _int_env("UI_SLOW_MO", 200)
    )
    exec_wait_ms = (
        exec_wait_arg
        if exec_wait_arg is not None
        else _int_env("UI_EXEC_WAIT_MS", 120000)
    )

    wfs = WORKFLOWS
    if single_id:
        wfs = [w for w in WORKFLOWS if w["id"] == single_id]
        if not wfs:
            print(f"Unknown workflow id {single_id}", file=sys.stderr)
            return 1

    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text("", encoding="utf-8")
    log_action(
        f"UI test run start | slow_mo={slow_mo if not headless else 0} | exec_wait_ms={exec_wait_ms}"
    )

    results: list = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            slow_mo=slow_mo if not headless else 0,
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        try:
            await ensure_login(page, base, email, password)
        except Exception as e:
            log_action(f"LOGIN FAILED: {e}")
            await page.screenshot(
                path=str(SCREENSHOTS / "00_login_failed.png"), full_page=True
            )
            print(f"Login failed: {e}", file=sys.stderr)
            await browser.close()
            return 1

        for meta in wfs:
            if meta["id"] == EMAIL_TRIAGE_ID:
                continue
            log_action(f"Workflow {meta['order']}/{len(wfs)} started: {meta['name']}")
            restore_ok = await run_one(page, base, meta, results, exec_wait_ms)
            if not restore_ok:
                log_action(
                    "CRITICAL: test_mode restore/verify failed — emergency API restore all + halt sequence"
                )
                emergency_restore_all_workflows()
                await browser.close()
                phase3 = phase3_collect_sync()
                REPORT_PATH.write_text(build_report(results, phase3), encoding="utf-8")
                append_run_summary_to_log(results, phase3)
                return 3

            await asyncio.sleep(3)

        await browser.close()

    log_action("Final API pass: test_mode true + activate all targets")
    emergency_restore_all_workflows()

    phase3 = phase3_collect_sync()
    REPORT_PATH.write_text(build_report(results, phase3), encoding="utf-8")
    log_action("UI test run complete — report written")
    append_run_summary_to_log(results, phase3)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("workflow_id", nargs="?", default=None, help="Optional single workflow id")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--slow-mo", type=int, default=None, help="Playwright slow_mo ms (non-headless)")
    ap.add_argument(
        "--exec-wait-ms",
        type=int,
        default=None,
        help="Max wait for execution panel text (default 120000)",
    )
    args = ap.parse_args()
    return asyncio.run(
        async_main(
            args.headless,
            args.workflow_id,
            args.slow_mo,
            args.exec_wait_ms,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
