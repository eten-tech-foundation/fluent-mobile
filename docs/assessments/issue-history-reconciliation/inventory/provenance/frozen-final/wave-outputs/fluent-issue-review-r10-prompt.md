You are quality reviewer **r10** (wave 4) for fluent-mobile issue-history reconciliation.

## Hard rules
- READ-ONLY on repo code/docs. Write ONLY `/tmp/fluent-issue-review-r10.json` and `/tmp/fluent-issue-review-r10.md`.
- Do NOT edit coverage.csv, git, GitHub, device, Maestro, tokens.
- Do NOT set reconciliation_complete — integrator merges.
- Skip #721. Exact batch only. No repeat of already-complete IDs.
- Contract: docs/assessments/issue-history-reconciliation/inventory/complete-row-contract.md
- Taxonomy: docs/assessments/issue-history-reconciliation/inventory/disposition-taxonomy.md
- Corpus: docs/assessments/issue-history-reconciliation/inventory/issues/<id>.json

## Exact IDs (24)
255, 258, 259, 260, 261, 267, 268, 269, 270, 273, 274, 275, 276, 277, 279, 282, 289, 291, 292, 293, 294, 298, 300, 314

## Output
Top-level JSON: reviewer=r10, wave=4, domain=mid-late-gap-255+, ids=[...], reviewed_at_utc, corpus, contract, skip, recommend_complete_count, recommend_complete_false_count, issues=[per-issue objects per contract schema].
Per issue: requirement[], disposition[], code_docs_evidence[path/lines/fact], material_pr_or_decision or material_pr_or_decision_na, source_vs_qa, recommend_complete, blocker_if_incomplete, finding.
recommend_complete=true only with real path:line evidence. Merged PR alone ≠ proof — cite working tree. Do not manufacture bugs from additional behavior unless AC forbids. Complete ≠ QA pass.
Also write /tmp/fluent-issue-review-r10.md summary. Print counts and stop.
