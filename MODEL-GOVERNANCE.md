# Exsto Cura — Model Governance Policy

## Approved Models by Use Case

| Use Case | Model | Reason |
|---|---|---|
| BIR™ Analysis | claude-sonnet-4-20250514 | Defensible client deliverable |
| TRIAGE-IMPACT™ TIA | claude-sonnet-4-20250514 | Commercial claims work |
| Monthly Report Narrative | claude-sonnet-4-20250514 | Executive client delivery |
| Prospect Intelligence | claude-sonnet-4-20250514 | BD quality standard |
| Email Triage | claude-sonnet-4-20250514 | Operational standard |

## Never Downgrade Without Explicit Approval
cost-optimize.ps1 and import-all-exsto-workflows.ps1 contain model downgrade logic.
These scripts must NOT be run on production workflows without explicit sign-off.
Haiku is appropriate ONLY for internal testing and non-client-facing automation.

## Cost Reality
claude-sonnet-4-20250514 costs approximately $0.003-0.08 per workflow execution.
Monthly total across all 5 workflows: $3-5.
There is NO economic justification for downgrading client-facing analysis to Haiku.
