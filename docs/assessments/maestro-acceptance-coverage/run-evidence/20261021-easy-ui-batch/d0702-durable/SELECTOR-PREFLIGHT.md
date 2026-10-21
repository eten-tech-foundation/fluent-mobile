# D-0702-01 selector preflight (A/B hydration branch)

**Worktree:** `worktrees/d0702-gospel-test-pr`  
**Selector-preflight runtime (retained FAIL, not PASS):** `artifacts/d0702-pr755-selector-preflight-runtime-20261021/` head `fbb8fbcc` · `MAESTRO_FAIL_CLEANUP_OK`  
**Later device pass (separate final-dismiss run):** head `753aecd8` · `MAESTRO_OK_CLEANUP_OK` — does **not** rewrite this preflight FAIL receipt  
**Heads after `753aecd8` (including `984fc794`):** not re-executed on device  
**Verdict:** authoring gates READY; device claim limited to stamped heads above

---

## Correction vs earlier preflight

| Prior claim | Corrected |
| --- | --- |
| `prepare-offline-resources-section` is source-only / always absent | **Conditional:** absent at **zero** selection; **present after** selection+successful hydration (step-066) |
| Criterion = always exact unavailable message | **Stale:** Matthew ch1 hydrated available resources (Source Bible audio 1.7 MB, Translation Notes 70 KB, Total/Download 2.4 MB, Download **enabled**). Unavailable remains a valid **alternate** terminal from historical evidence — not required every run |

Artifact failure on `fbb8fbcc` retained — no conversion to PASS. Successful `753aecd8` run is recorded separately in `offline-validation.json` / PR body.

---

## Branch assertions (each of Matthew / Mark / Luke)

After 0→1 + `checked: true` + book/selected counts + footer/Total/Download visible (disabled-during-loading is **transient**, not terminal):

**Bounded scroll-wait** (not footer-first / not N×animation): `scrollUntilVisible` resources-section (45s, optional) → else unavailable message (45s) → else UP re-check resources (15s) → `assertTrue` branch ∈ {available,unavailable}. Timeout / loading / disabled-only → fail:

### (A) Available — `d0702-assert-hydration-available.yaml`

| Assert | Evidence |
| --- | --- |
| `prepare-offline-resources-section` | step-066 id |
| `^RESOURCES TO DOWNLOAD$` | step-066 text |
| `prepare-offline-resource-summary` | step-066 id |
| `resource-tier-1` + `^TIER 1 — REQUIRED$` | step-066 |
| `^Source Bible$` + `^Translation Notes$` | step-066 groups |
| positive row size `^\d+(\.\d+)? (KB\|MB)$` | 1.7 MB / 70 KB (rounded; no sum==total claim) |
| `prepare-offline-total-bytes` + positive size (not `0 B`) | 2.4 MB |
| Download `enabled: true` + `^Download (?!0 B$).+$` | accessibilityText `Download 2.4 MB` |
| not unavailable message; not `footer-hint`; not Loading; not downloading controls | step-066 |

### (B) Unavailable — `d0702-assert-hydration-unavailable.yaml`

| Assert | Evidence |
| --- | --- |
| Exact unavailable message regex | reconciliation + prior selected PNG/XML |
| `prepare-offline-footer-hint` | prior unavailable XML |
| total `^0 B$` + Download `enabled: false` + `^Download 0 B$` | prior unavailable |
| not `resources-section` / RESOURCES TO DOWNLOAD; not Loading; not downloading | catalog empty on fail |

Then **shared:** footer + Total + Download visible, not downloading → 1→0 `checked: false` + book zero + `Selected chapters (0)` + footer Download disabled → Collapse. Parent restore12 / closed Home / external finally **unchanged**.

**Not admitted:** successful empty catalog (`No downloadable resources are available…`) — distinct from couldn't-load unavailable; parked pending product confirmation (assertions not weakened).

---

## Files

| Path | Role |
| --- | --- |
| `d0702-book-ch1-unavailable-persist.yaml` | 0→1 → A/B poll → 1→0 |
| `d0702-assert-hydration-available.yaml` | Full available suite |
| `d0702-assert-hydration-unavailable.yaml` | Full unavailable suite |
| `d0702-hydration-branch.cjs` + `.test.cjs` | Static classifier (loading/mixed/invalid cannot PASS) |
| `d0702-ee-gospel-ch1-download-persist*.yaml` / `.test.cjs` | Parent + contract tests |
| this receipt | |

No app source. No Download tap / network. No invented empty-catalog manifest.

---

## Explicit omitted / unsupported

| Item | Notes |
| --- | --- |
| Byte arithmetic (1.7+70≟2.4) | Out of scope; rounded labels only |
| Download tap / queue | Forbidden |
| Requiring available to fail | Forbidden |
| Weak OR of one element | Forbidden — full branch suite |
| Successful empty catalog as terminal | Parked — see README / PR question |
| Unsupported anchors | **None** for authored terminals |
