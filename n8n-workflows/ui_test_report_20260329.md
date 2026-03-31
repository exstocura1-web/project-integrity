# UI Live Manual Test Report

**Date:** 2026-03-29  
**Method:** Playwright browser automation (prepared; **not executed** — missing UI login env)  
**Instance:** https://exo-project-integrity.app.n8n.cloud  

## Automation status

| Phase | Status |
|-------|--------|
| Phase 0 — Security | **Complete** — see `ui_security_check_20260329.txt` |
| Phase 1 — `.env` login | **Blocked** — `N8N_CLOUD_EMAIL` / `N8N_CLOUD_PASSWORD` not present in `C:\Exsto\.env` |
| Phase 2–5 — UI run | **Not run** — add credentials locally, then run commands below |

### Unblock checklist

1. Add to `C:\Exsto\.env` (do not commit; `.env` is already in `.gitignore`):

```env
N8N_CLOUD_EMAIL=you@example.com
N8N_CLOUD_PASSWORD=your_password_here
```

2. Smoke test:

```powershell
cd C:\Exsto\n8n-workflows
py ui_live_test.py TtSLiFqydMLODkHI
```

3. Full sequence:

```powershell
py ui_live_test.py
```

Optional: `py ui_live_test.py --slow-mo 500` or `set UI_EXEC_WAIT_MS=150000` if the editor is slow.

## Script updates (this session)

- **Continue on workflow failure** unless `test_mode` **restore/verify** fails (then emergency `restore_test_mode` + `activate` for all five, exit code 3).
- **Execution wait** default **120s** (`UI_EXEC_WAIT_MS` or `--exec-wait-ms`).
- **`--slow-mo`** / **`UI_SLOW_MO`** for stability.
- **End-of-run:** `emergency_restore_all_workflows()` ensures **active + test_mode true** on all targets before the markdown report.
- **Summary** appended to `ui_test_log.txt` via `append_run_summary_to_log()` after each full run.

## Test Results

_(Empty — run not executed.)_

| Order | Workflow | Execution Status | First Production Node Hit | Expected Node | Match | test_mode Restored | Live Calls |
|-------|----------|------------------|---------------------------|---------------|-------|-------------------|------------|

## Execution Timeline

| Workflow | Start | End | Duration | Last Node |
|----------|-------|-----|----------|-----------|

## Live External Calls Confirmed

| Workflow | Service | Node | Status |
|----------|---------|------|--------|

## Failures & Remediation

- **Credentials:** Operator must set `N8N_CLOUD_EMAIL` and `N8N_CLOUD_PASSWORD` in `.env`. This assistant does not receive or store passwords.

## Screenshots Index

- After a successful run: `00_login_success.png`, `{order}_{slug}_01` … `07`, plus `99_error_state` on per-workflow errors.

## test_mode Final State (API verified)

| Workflow | Value | Verified |
|----------|-------|----------|
| _(run `py -c` verification after a successful UI run)_ | true | — |
