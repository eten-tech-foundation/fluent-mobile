# Complete-row contract (integrator acceptance)

A row may be marked `reconciliation_complete=yes` **only** when the integrator accepts a review that explicitly records all of the following. Cohorts/triage flags are **not** sufficient.

## Required fields (every complete row)

1. **Specific requirement** — quote or precise paraphrase of the in-force AC slice(s), with issue URL. Split **layout vs permission** (and other orthogonal AC) when both appear.
2. **Current disposition** — taxonomy label(s) from `disposition-taxonomy.md` (e.g. `AGREED_REQUIREMENT`, `OPEN_TICKET_UNRESOLVED`, `PRODUCT_DECISION_REQUIRED`, `LATEST_EXPLICIT_DECISION`, `CONFIRMED_CURRENT_SOURCE`, `HISTORICAL_DEVICE_EVIDENCE`, `NO_PRODUCT_FIX` only when investigation truly changed nothing).
3. **Code/docs evidence** — `path:line` (or tight range) **or** exact quote from a living doc, stating what it does relative to the requirement. Generic “see product-behavior” is insufficient.
4. **Material PR/decision review** — URL + one fact from the PR/comment that affects the requirement, **or** explicit `reason_not_applicable:` (e.g. no linked PR; comments are planning hours only; decision is eng note dated YYYY-MM-DD at URL).

## Distinctions reviewers must make

| Trap | Rule |
| --- | --- |
| Layout vs permission | Reconcile separately; later layout tickets do not waive permission AC by omission |
| Explicit deferral vs bug | Deferred/waived AC needs a dated comment/PR; open bug ≠ deferral |
| Source/current vs deployed QA | Cite working-tree paths separately from Dev/QA device dated evidence |
| Missing decision vs inferred | Living docs labeled **Inferred** are not product agreement; missing waive = decision required or still AGREED |
| Closed state | History only — not proof of acceptance |

## Forbidden completion engines

Scripts may inventory, count, format CSV, copy `/tmp`. Scripts must **never** set `reconciliation_complete=yes` from keywords, `state=closed`, body length, or a generic docs pointer.

## Parallel reviewer protocol

1. Integrator assigns **non-overlapping** exact incomplete IDs (first wave: **3–5** per reviewer).
2. Reviewers are **READ-ONLY** on repo code/docs; write **only** their `/tmp/fluent-issue-review-rN.*`.
3. Shared corpus: `docs/assessments/issue-history-reconciliation/inventory/issues/<id>.json`.
4. Integrator verifies quality on the small batch before extending ownership.
5. Do **not** duplicate active Sync `#721` lead work or revive unsteerable extra workers.
6. Preserve all **308** ledger rows; do not stop at a priority subset.

## Output schema (per issue in reviewer JSON)

```json
{
  "issue": 0,
  "requirement": [{"slice": "layout|permission|other", "text": "...", "source_url": "https://github.com/eten-tech-foundation/fluent-mobile/issues/N"}],
  "disposition": ["TAXONOMY_LABEL"],
  "code_docs_evidence": [{"path": "src/...", "lines": "12-40", "fact": "..."}],
  "material_pr_or_decision": {"url": "..." , "fact": "..."} ,
  "material_pr_or_decision_na": null,
  "source_vs_qa": {"working_tree": "...", "device_evidence": "none|dated ..."},
  "recommend_complete": false,
  "blocker_if_incomplete": "what is still missing"
}
```

Set `recommend_complete=true` only if all four required fields are filled with real evidence. Integrator alone edits `coverage.csv`.

## Complete ≠ conformance

A complete audit row may record a **named unwaived divergence** or **product decision required**. That is a finished reconciliation finding — **not** a claim that the app passes QA or conforms to the original AC.

## Retired bulk engines

`inventory/_deepen_product_pending.py` and `inventory/_recount_and_deepen.py` are **RETIRED** (exit 2). Quarantine: `inventory/provenance/retired-semantic-completion-scripts/`. Counts: `inventory/_count_completion_readonly.py` (read-only).
