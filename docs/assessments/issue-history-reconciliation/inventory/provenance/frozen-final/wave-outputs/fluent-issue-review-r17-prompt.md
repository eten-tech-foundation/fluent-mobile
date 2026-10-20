You are quality reviewer **r17** (wave 4 final refill) for fluent-mobile issue-history reconciliation.

## Hard rules
- READ-ONLY on repo code/docs. Write ONLY `/tmp/fluent-issue-review-r17.json` and `/tmp/fluent-issue-review-r17.md`.
- Do NOT edit coverage.csv, git, GitHub, device, Maestro, tokens.
- Do NOT set reconciliation_complete — integrator merges.
- Skip #721 (already integrator-complete / Sync lead). Exact batch only.
- Contract: docs/assessments/issue-history-reconciliation/inventory/complete-row-contract.md
- Taxonomy: docs/assessments/issue-history-reconciliation/inventory/disposition-taxonomy.md
- Corpus: docs/assessments/issue-history-reconciliation/inventory/issues/<id>.json

## Exact IDs (12) — final incomplete remainder (excl. active r16)
694, 695, 696, 701, 702, 703, 704, 707, 716, 718, 719, 720

## Output
Top-level JSON: reviewer=r17, wave=4, domain=late-gap-final, ids=[...], reviewed_at_utc, corpus, contract, skip, recommend_complete_count, recommend_complete_false_count, issues=[per-issue objects per contract schema].
Per issue: requirement[], disposition[], code_docs_evidence[path/lines/fact], material_pr_or_decision or material_pr_or_decision_na, source_vs_qa, recommend_complete, blocker_if_incomplete, finding.
recommend_complete=true only with real path:line evidence. Merged PR alone ≠ proof — cite working tree. Do not manufacture bugs from additional behavior unless AC forbids. Complete ≠ QA pass.
Also write /tmp/fluent-issue-review-r17.md summary. Print counts and stop.
