# D-0702-01 selector preflight (one-pass, no device)

**Worktree:** `worktrees/d0702-gospel-test-pr` · head context `912c0040` + local selector fixes  
**Evidence root:** `/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/`  
**Runtime fail preserved:** `d0702-pr755-closed-home-runtime-20261021/` step-029 wait on `prepare-offline-resources-section`  
**Verdict:** **READY** for root runtime (no unsupported dynamic anchors remaining)

---

## Assertion → evidence → replacement → behavior

| Assertion / relationship | Evidence (file → observed) | Change | Behavior preserved |
| --- | --- | --- | --- |
| `prepare-offline-resources-section` wait/assert | step-029 hierarchy + all retained PFO XML: **absent**; source-only `testID` | **Removed** from parent + nested | Container readiness now via footer + Selected chapters + gospel rows |
| `prepare-offline-download-footer` | `d0702-current-pfo-hierarchy.xml`, mark/luke XML, step-029 ids | **Unchanged** (primary readiness oracle) | Same PFO detail footer state |
| `prepare-offline-screen` | same hierarchies | **Unchanged** | On PFO |
| `^Selected chapters \(0\)$` (YAML single-quoted) | content-desc/text `Selected chapters (0)` in current-pfo + deselected XML; step-029 text | **Fixed escape** (`\\(` → `\(` so regex matches labels); parent waits this instead of resources-section | Zero-selection chrome |
| `^Selected chapters \([0-9]+\)$` (nested entry) | selected `(1)` / deselected `(0)` XML | **Fixed escape** (same) | Selection chrome present |
| `^Selected chapters \([1-9][0-9]*\)$` after ch1 | mark/luke selected: `Selected chapters (1)` | **Fixed escape** (same) | Non-zero after select |
| `^Matthew, 0 of 28 chapters selected$` (+ Mark 16 / Luke 24) | content-desc in current-pfo + all book XML; step-029 shows book names (Maestro text matches a11y) | **Added** parent entry + **unchanged** post-nested / env | Gospel project13 books at 0 |
| `^Matthew\|Mark\|Luke, 1 of N chapters selected$` env | mark/luke selected XML content-desc | **Unchanged** env | 0→1 book count |
| `^Expand X$` / `^Collapse X$` | content-desc `Expand Matthew`, `Collapse Mark`, etc. in retained XML (not visible `text`) | **Unchanged** (a11y via Maestro `text:`) | Expand/collapse relationship |
| `^Chapter 1$` + `checked: false/true` | CheckBox content-desc `Chapter 1`; selected `checked="true"` / deselected `checked="false"` | **Unchanged** | Ch1 toggle uniqueness while book expanded |
| scroll → Expand / Chapter 1 / Download button | nav relationship in manual journey + XML bounds | **Unchanged** | Same scroll/tap order |
| `prepare-offline-download-button` `enabled: false` | all retained XML `enabled="false"` | **Unchanged** | Download stays disabled |
| `^Download .+$` (not bare `^Download$`) | text/content-desc `Download 0 B` | **Unchanged** | Size suffix tolerated |
| `^Total download$` + `prepare-offline-total-bytes` | retained XML + step-029 | **Unchanged** | Footer totals |
| unavailable message regex | reconciliation md exact string; Luke selected PNG re-inspect (XML caught Loading…) | **Unchanged** wait ≤60s | Unavailable branch |
| `prepare-offline-footer-hint` | mark/luke selected XML resource-id (Loading text on same id pre-settle) | **Unchanged** | Hint chrome after settle |
| `assertNotVisible` Loading `…` | mark/luke selected XML exact unicode ellipsis | **Unchanged** | Past loading |
| `assertNotVisible` `prepare-offline-download-controls-downloading` | absent in idle/selected hierarchies | **Unchanged** | Negative: not downloading |
| Closed Home / gear → drawer | `d0702-live-drawer-closed-*.xml`, `d0702-live-gear-opens-*.xml`; accounts 9/10/12 | **Unchanged** (prior closed-Home fix) | Cached account route |
| `project-row-13` → detail | prior runtime passed this; step-029 is detail | **Unchanged** | Project13 entry |
| restore active12 + cache 10/9/12 + dismiss drawer | reconciliation + postcase; host finally | **Unchanged** | Happy-path restore12 |
| External finally / closed-Home safety | host-runner-result.json | **Unchanged** | Prior failures preserved |

---

## Explicit omitted checks

| Check | Why omitted |
| --- | --- |
| `prepare-offline-resources-section` | Source-only; absent from every retained/runtime hierarchy |
| Assigned-chapters / Select-all / `pfo-selector-values.js` | Wrong chrome for project13 Selected-chapters journey |
| Available-download byte arithmetic / Download tap | Out of criterion; forbidden |
| Bare `^Download$` | Known false positive vs `Download 0 B` |

---

## Unsupported remaining / lack of evidence

**None** for remaining authored anchors.

Note (not a STOP): unavailable **message text** is not frozen in selected XML dumps (snapshots caught `Loading…` on `prepare-offline-footer-hint`). Exact string is evidenced by `d0702-direct-behavior-reconciliation-20261021.md` + Luke selected PNG. Flow still waits for that exact message.

---

## Full replacement list (this pass)

1. Parent: remove `extendedWaitUntil` / any assert on `prepare-offline-resources-section`.
2. Parent: wait `prepare-offline-download-footer` (60s) then `^Selected chapters \\(0\\)$`.
3. Parent: assert Matthew/Mark/Luke zero book content-desc regexes + `^Download .+$` + `^Total download$` at detail entry.
4. Nested: remove resources-section; assert footer + Selected chapters + `D0702_BOOK_ZERO` + Total download + total-bytes as detail oracle.
5. Nested: keep Expand/Collapse/Chapter1 checked/unavailable/footer-hint/Download disabled/negative downloading — unchanged behaviorally.
6. Fix Selected chapters paren escaping in single-quoted YAML (`\(0\)` not `\\(0\\)`) so Maestro regex matches retained labels.
7. Static tests: ban resources-section in D0702 YAML; exercise authored regexes vs retained exact labels; catch over-escape.

Full list also in chat return to root before runtime.

---

## Files / tests this pass

- `.maestro/flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml`
- `.maestro/flows/offline/d0702-book-ch1-unavailable-persist.yaml`
- `.maestro/flows/offline/d0702-ee-gospel-ch1-download-persist.test.cjs`
- this receipt

No app source. No device. No commit/push.
