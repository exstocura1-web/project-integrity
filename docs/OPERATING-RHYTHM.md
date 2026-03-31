# Operating Rhythm

This document defines the weekly execution cadence for Project Integrity operations.

## Weekly Cadence

### Monday - Plan and Prioritize
- Review Launchpad and open PR queue
- Triage new issues (bug, feature, security)
- Confirm this week's release target and risk items

### Wednesday - Build and Validate
- Validate active work against acceptance criteria
- Confirm CI status on all open PRs
- Re-scope or de-risk blockers before Friday release window

### Friday - Release and Report
- Merge approved PRs to `main`
- Cut release tag and publish release notes
- Run post-release smoke checks and document outcomes

## Pull Request Standard

All PRs must include:
- Business outcome and delivery rationale
- Test evidence
- Deployment and rollback notes
- Identified cost/schedule/risk implications

## Daily Minimum Discipline

- Keep `main` clean and protected
- Resolve stale PR conversations
- Close completed items and update ownership where needed
