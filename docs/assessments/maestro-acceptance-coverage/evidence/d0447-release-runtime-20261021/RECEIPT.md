# D-0447-01 reconciliation receipt

UTC: 2026-10-21T21:26:58Z

## Decision
**complete_for_requirement / PASS** — whole atomic criterion satisfied by composite packaging + version map + unknown→null loader contract + both mapped runtime observations (FIA 4 groups + FCBH 9 groups).

## Literal criterion
- Coverage behavior: bundled FIA/FCBH JSON loads for mapped setId (version/hash map)
- Expected: mapped setId loads; unknown→null
- #447 allows version **or** hash; hash validation / embedded VCS attestation are **not** mandatory gates

## Evidence
- Static: `/tmp/fluent-d0447-static-fa60bd07/bundle-disassembly.txt` — loadBundledPericopeSet, setIds 1/2, normalization, null fallback, version 2026-09-04, arrays 16910/16870; APK SHA256 `28af24f…e36b6b`
- Unit (complementary, not re-run): `src/services/pericopeSets.test.ts` mapped ids + unknown→null
- Runtime FIA (set2): ['1–5', '6–12', '13–16', '17–25'] via `postsignin-fia-chapter1.xml` (ids `bible-pericope-pericope::1, bible-pericope-pericope::2, bible-pericope-pericope::3, bible-pericope-pericope::4`); earlier unavailable retained
- Runtime FCBH (set1): ['1–2', '3–5', '6–7', '8–9', '10–12', '13–16', '17–19', '20–21', '22–25'] via `fcbh-chapter1.xml` + `fcbh-chapter1-bottom.xml` (ids `bible-pericope-pericope:1:1, bible-pericope-pericope:2:1, bible-pericope-pericope:2:2, bible-pericope-pericope:2:3, bible-pericope-pericope:2:4, bible-pericope-pericope:3:1, bible-pericope-pericope:3:2, bible-pericope-pericope:3:3, bible-pericope-pericope:3:4`); section:number distinguishes from FIA `::N`

## Residual
None for literal D-0447-01 atomic acceptance.

## Non-claims
See receipt.json `non_claims`. Guest Pericope-mode cleanup not asserted; root UI batch pending.
