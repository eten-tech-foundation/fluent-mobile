# Gap register (post-freeze operational map)

| Field | Value |
| --- | --- |
| Verification snapshot UTC | `2026-10-20T02:11:38Z` |
| Role | Operational map **after** FINAL freeze — **not** part of the original 59-entry SHA256 freeze manifest |
| Twin | [`inventory/gap-register.json`](./inventory/gap-register.json) |
| Ledger / report (read-only links) | [`coverage.csv`](./coverage.csv) · [`FINAL-report.md`](./FINAL-report.md) |
| Publication | **Complete** for this wave — [#722](https://github.com/eten-tech-foundation/fluent-mobile/issues/722) only; **no more** issues/comments/edits from this register task |
| Inputs | `/tmp` GAP-MAPPING + gap-mapping-review + `fluent-g10-created.json` |

**Pins:** audit snapshot HEAD `5334ff6…` · published mobile `758d4b04a9ca81e1ed6228e9d30df1fc80014f5d` · API `4336602df77ce86a4d46dfd45a7840cc3c64ebc0`. Issue/PR **state can change** after this snapshot.

**Limitations:** Source ≠ live QA / Nightly. Role labels ≠ grant proof. No account emails, private fixtures, credentials, or raw corpus. No PM blame. No “perfect” / exhaustive conformance claim.

---

## Status summary (16 groups)

| Action | Count | Groups |
| --- | ---: | --- |
| `reuse_open` | 10 | G1–G7, G11, G14, G16 |
| `existing_closed_sufficient` | 1 | G8 |
| `defer_no_create` | 4 | G9, G12, G13, G15 |
| `decision_needed_open` | 1 | G10 (#722) |

---

## Register G1–G16

| ID | Gap | Original → later | Current tracker | Action | Source vs QA |
| --- | --- | --- | --- | --- | --- |
| **G1** | Offline stage queue | [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) → [eng note](https://github.com/eten-tech-foundation/fluent-mobile/issues/257#issuecomment-5273627839); [PR #361](https://github.com/eten-tech-foundation/fluent-mobile/pull/361) | [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) **OPEN** | `reuse_open` | Source unimplemented + launch TBD; ≠ Nightly |
| **G2** | Reconnect claim remainder | [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) → slice [#611](https://github.com/eten-tech-foundation/fluent-mobile/issues/611)/[PR #667](https://github.com/eten-tech-foundation/fluent-mobile/pull/667); [#610](https://github.com/eten-tech-foundation/fluent-mobile/issues/610)/[PR #653](https://github.com/eten-tech-foundation/fluent-mobile/pull/653); [PR #427](https://github.com/eten-tech-foundation/fluent-mobile/pull/427) | [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) **OPEN** | `reuse_open` | Slice closed; parent open |
| **G3** | Upload foreground crash | [#599](https://github.com/eten-tech-foundation/fluent-mobile/issues/599) → [PR #682](https://github.com/eten-tech-foundation/fluent-mobile/pull/682) | [#599](https://github.com/eten-tech-foundation/fluent-mobile/issues/599) **OPEN** | `reuse_open` | OPEN_BUG; mitigations ≠ closed; current QA unproven |
| **G4** | Sync entry automation | Baselines [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38)/[#149](https://github.com/eten-tech-foundation/fluent-mobile/issues/149) → [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) | [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) **OPEN** | `reuse_open` | Local Maestro ≠ Nightly |
| **G5** | Observer My Work / offline draft | — | [#505](https://github.com/eten-tech-foundation/fluent-mobile/issues/505), [#508](https://github.com/eten-tech-foundation/fluent-mobile/issues/508), [#452](https://github.com/eten-tech-foundation/fluent-mobile/issues/452) **OPEN** | `reuse_open` | Open AC + accepted source gap |
| **G6** | Claim-pool / Maestro seeds | — | [#607](https://github.com/eten-tech-foundation/fluent-mobile/issues/607), [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717) **OPEN** | `reuse_open` | Fixture/API seed dep (≠ mobile #368/#369) |
| **G7** | Gallery / sync FR batch | — | [#694](https://github.com/eten-tech-foundation/fluent-mobile/issues/694)–[#696](https://github.com/eten-tech-foundation/fluent-mobile/issues/696), [#701](https://github.com/eten-tech-foundation/fluent-mobile/issues/701), [#703](https://github.com/eten-tech-foundation/fluent-mobile/issues/703), [#704](https://github.com/eten-tech-foundation/fluent-mobile/issues/704), [#716](https://github.com/eten-tech-foundation/fluent-mobile/issues/716) **OPEN** | `reuse_open` | OPEN_followup; source_gap only if accepted row proves |
| **G8** | Auth 401 / sign-out from #41 | [#41](https://github.com/eten-tech-foundation/fluent-mobile/issues/41) → [PR #46](https://github.com/eten-tech-foundation/fluent-mobile/pull/46); [#292](https://github.com/eten-tech-foundation/fluent-mobile/issues/292) [dup→#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/292#issuecomment-5208306644) → [#291](https://github.com/eten-tech-foundation/fluent-mobile/issues/291) + [PR #342](https://github.com/eten-tech-foundation/fluent-mobile/pull/342); [#622](https://github.com/eten-tech-foundation/fluent-mobile/issues/622) + [PR #658](https://github.com/eten-tech-foundation/fluent-mobile/pull/658) | Policy **#291 CLOSED**; retention context **#622 CLOSED** | `existing_closed_sufficient` | **Policy superseded** (soft reauth). Soft-reauth **QA unproven** ≠ Nightly. No new #41/#401 wipe ticket; no blanket retention waiver beyond #622 |
| **G9** | Translator “assigned” wording | [#4](https://github.com/eten-tech-foundation/fluent-mobile/issues/4) → [#104](https://github.com/eten-tech-foundation/fluent-mobile/issues/104), [#675](https://github.com/eten-tech-foundation/fluent-mobile/issues/675) | Ambiguity on **#4 / #104 / #675** only | **`defer_no_create`** — **map no issue** | Decision wording deferred; not a new defect card |
| **G10** | Nav visibility + denied UX by grant | — → **[#722](https://github.com/eten-tech-foundation/fluent-mobile/issues/722)** created | [#722](https://github.com/eten-tech-foundation/fluent-mobile/issues/722) **OPEN** · author **`mattrace-gloo`** | `decision_needed_open` | Decision coverage (incl. **PM + SA**). **Does not** claim hide chosen, security bypass, or live 403. Server auth remains. Grants ≠ chapter slots. Role labels ≠ proof |
| **G11** | #176 remux/scrub QA evidence | [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176)/[#233](https://github.com/eten-tech-foundation/fluent-mobile/issues/233) → [PR #252](https://github.com/eten-tech-foundation/fluent-mobile/pull/252)/[#254](https://github.com/eten-tech-foundation/fluent-mobile/pull/254)/[#231](https://github.com/eten-tech-foundation/fluent-mobile/pull/231); [#707](https://github.com/eten-tech-foundation/fluent-mobile/issues/707)/[PR #709](https://github.com/eten-tech-foundation/fluent-mobile/pull/709) | [#719](https://github.com/eten-tech-foundation/fluent-mobile/issues/719), [#720](https://github.com/eten-tech-foundation/fluent-mobile/issues/720), parent [#717](https://github.com/eten-tech-foundation/fluent-mobile/issues/717) **OPEN** | `reuse_open` | Source fixed; **no** new #176 QA sibling |
| **G12** | Optional `env.ts` | [#109](https://github.com/eten-tech-foundation/fluent-mobile/issues/109) | [#109](https://github.com/eten-tech-foundation/fluent-mobile/issues/109) **CLOSED** | `defer_no_create` | Valid optional absence |
| **G13** | PM Home default tab | [#234](https://github.com/eten-tech-foundation/fluent-mobile/issues/234) | [#234](https://github.com/eten-tech-foundation/fluent-mobile/issues/234) **CLOSED** | `defer_no_create` | Explicitly nonblocking |
| **G14** | Historical Dev audit Fails | → [PR #577](https://github.com/eten-tech-foundation/fluent-mobile/pull/577)/[#598](https://github.com/eten-tech-foundation/fluent-mobile/pull/598) | [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529), [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) **OPEN** | `reuse_open` | HISTORICAL device evidence ≠ Nightly |
| **G15** | Multi-role / SA live verify | — | _(no product ticket)_ | `defer_no_create` | Process/evidence gap; no private account material |
| **G16** | Offline audio conflict | [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) | [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) **OPEN** | `reuse_open` | Implementation tracker |

---

## G9 / G10 (publication outcomes)

| Gap | Outcome |
| --- | --- |
| **G9** | **DEFERRED** — wording ambiguity recorded with [#4](https://github.com/eten-tech-foundation/fluent-mobile/issues/4) / [#104](https://github.com/eten-tech-foundation/fluent-mobile/issues/104) / [#675](https://github.com/eten-tech-foundation/fluent-mobile/issues/675); **no new issue** |
| **G10** | **[#722](https://github.com/eten-tech-foundation/fluent-mobile/issues/722)** **OPEN** decision-needed; owner verified **`mattrace-gloo`**; matrix AC includes Project Manager + SuperAdmin (coverage only) |

Reuse all other implementation/QA trackers above — do not duplicate them as “new” gaps.

---

*Post-freeze register only. Frozen corpus / original SHA256SUMS unchanged by this file.*
