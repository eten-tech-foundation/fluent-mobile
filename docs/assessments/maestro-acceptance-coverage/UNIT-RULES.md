# Acceptance mapping — atomic unit rules

Generated: `2026-10-20T05:06:00Z` · pass `unit_rules_classify_v1`

**Freeze:** raw **204** / canonical **202** candidates. No additional requirements. No domain JSON/MD edits. No device/repo/network/tests.

Inputs: `consolidated.json`, `CONTRACT.md` only.

## Atomic unit

An atomic acceptance unit is exactly:

> **one actor + one trigger/precondition + one independently falsifiable observable outcome**

| Rule | Meaning |
| --- | --- |
| Single outcome | If two outcomes can pass/fail independently, they are two units |
| Matrices | State / role / error / connectivity matrices → **separate cases** |
| Parent groups | `acceptance_group` / epic parents are **non-additive** vs children |
| Evidence | source / unit-mock / native / desktop complementary **≠** UI runtime PASS |
| Product gaps | deferred / product-missing **≠** out-of-scope discard; retain with reason |
| Superseded/waived | retained with reason; excluded from current unit denominator |

## Inclusion / exclusion (unit denominator — conceptual only)

**Include (candidate units):** current agreed `user_behavior` and `data_integrity` conditional requirements.

**Exclude from unit denominator (retain in map):** `test_harness`, `engineering_process`, `epic_parent`, superseded, waived, deferred, unresolved.

This review does **not** publish a whole-app percentage or manufactured atomic denominator. Root consolidates classifications without %.

## requirement_kind vocabulary

| Kind | Use |
| --- | --- |
| `user_behavior` | Actor-visible UI/workflow outcome |
| `data_integrity` | Persistence/sync/auth/storage correctness (may lack UI) |
| `test_harness` | Harness/CI/runner-only |
| `engineering_process` | Process/meta/scaffold/stub hygiene without user AC |
| `epic_parent` | Umbrella / audit / multi-clause parent |
| `unresolved` | Unclear from consolidated fields |

## candidate_granularity_review vocabulary

| Value | Use |
| --- | --- |
| `atomic` | Appears to match the atomic unit formula |
| `group` | Combined clauses / matrix / acceptance_group parent |
| `summary` | summary_only or process/harness rollup |
| `unresolved` | Cannot confirm without re-audit |

## Classification counts (204 IDs)

- by `requirement_kind`: `{"user_behavior":134,"epic_parent":46,"data_integrity":22,"engineering_process":2}`
- by `candidate_granularity_review`: `{"group":46,"atomic":148,"summary":10}`
- flagged non-atomic: **56**
- unresolved kind or granularity: **0**
- `include_in_behavior_denominator: true` (candidate flag only): **145**
- exact duplicate aliases: `D-0235-01→A-0004-01`, `A-0016-01→C-0038-01`

## Flagged non-atomic (short reason)

| ID | Kind | Gran review | Reason |
| --- | --- | --- | --- |
| `A-0001-01` | user_behavior | group | Compound and-clauses with multiple missing assertions |
| `A-0005-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0010-01` | data_integrity | group | Compound and-clauses with multiple missing assertions |
| `A-0013-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0017-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0022-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0023-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0025-01` | data_integrity | group | Multiple independently falsifiable clauses/state matrix combined |
| `A-0027-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0028-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `A-0029-01` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `A-0030-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0001-00` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `B-0002-02` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0004-03` | user_behavior | group | Compound and-clauses with multiple missing assertions |
| `B-0012-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0018-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0019-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0021-01` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `B-0024-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0026-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `B-0027-01` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `B-0090-01` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `B-0090-02` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `D-0235-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0531-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0408-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0578-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0504-01` | user_behavior | group | Multiple independently falsifiable clauses/state matrix combined |
| `D-0408-02` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0408-03` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0670-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0469-01` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `D-0585-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `D-0474-01` | epic_parent | summary | Mapped as summary_only; not a single falsifiable outcome |
| `C-0014-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0019-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0009-01` | engineering_process | summary | Process/harness item — not user/data atomic AC unit |
| `C-0149-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0039-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0050-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0051-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0051-03` | user_behavior | group | Multiple independently falsifiable clauses/state matrix combined |
| `C-0052-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0053-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0146-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0150-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0151-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0152-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0100-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0100-02` | user_behavior | group | Multiple independently falsifiable clauses/state matrix combined |
| `C-0101-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0508-01` | user_behavior | group | Multiple independently falsifiable clauses/state matrix combined |
| `C-0530-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0604-01` | epic_parent | group | Parent acceptance_group / multi-clause umbrella; non-additive vs children |
| `C-0374-01` | engineering_process | summary | Process/harness item — not user/data atomic AC unit |

## Full machine output

See `/tmp/fluent-acceptance-map/unit-review.json` (all 204 IDs).

## Explicit non-claims

- No splits manufactured; no domain edits
- No 308-history re-audit
- No runtime/device execution
- No readiness %
