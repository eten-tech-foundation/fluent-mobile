You are quality reviewer **r14** (wave 4 refill) for fluent-mobile issue-history reconciliation.

## Hard rules
- READ-ONLY on repo code/docs. Write ONLY `/tmp/fluent-issue-review-r14.json` and `/tmp/fluent-issue-review-r14.md`.
- Do NOT edit coverage.csv, git, GitHub, device, Maestro, tokens.
- Do NOT set reconciliation_complete — integrator merges.
- Skip #721. Exact batch only. No repeat of already-complete IDs.
- Contract: docs/assessments/issue-history-reconciliation/inventory/complete-row-contract.md
- Taxonomy: docs/assessments/issue-history-reconciliation/inventory/disposition-taxonomy.md
- Corpus: docs/assessments/issue-history-reconciliation/inventory/issues/<id>.json

## Exact IDs (24)
505, 508, 510, 513, 516, 527, 528, 531, 532, 533, 534, 536, 540, 542, 544, 545, 546, 547, 548, 549, 553, 554, 564, 567

## Output
Top-level JSON: reviewer=r14, wave=4, domain=late-gap-refill2, ids=[...], reviewed_at_utc, corpus, contract, skip, recommend_complete_count, recommend_complete_false_count, issues=[per-issue objects per contract schema].
Per issue: requirement[], disposition[], code_docs_evidence[path/lines/fact], material_pr_or_decision or material_pr_or_decision_na, source_vs_qa, recommend_complete, blocker_if_incomplete, finding.
recommend_complete=true only with real path:line evidence. Merged PR alone ≠ proof — cite working tree. Do not manufacture bugs from additional behavior unless AC forbids. Complete ≠ QA pass.
Also write /tmp/fluent-issue-review-r14.md summary. Print counts and stop.
