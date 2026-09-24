# Maestro E2E + safe fixtures for chapter ownership, taken warning, and online claim

## Summary

Found during the chapter assignment and claiming audit (#532). Live Debug device testing proved ownership and taken-warning UI for existing seeded states, but Maestro has no end-to-end assertions for those states, and claim / conflict / open-Peer-Check paths cannot be safely or deterministically exercised against shared developer/QA data.

## Expected

Provide deterministic/resettable E2E assignment fixtures and Maestro coverage so that:

- mine / other / unassigned ownership UI is asserted
- `record-taken-warning` is asserted
- online first-recording auto-claim runs only on disposable data and updates ownership UI immediately
- conflict and open Peer Check states can be reproduced without mutating shared projects

## Actual

- Existing Maestro smokes treat assignment only as a seed prerequisite
- Online auto-claim, claim UI update, and conflict/open-Peer-Check scenarios were SKIPPED or BLOCKED in #532 for fixture/policy reasons — not because product FAILs were observed on exercised paths

## Acceptance criteria

- [ ] Provide deterministic/resettable E2E assignment fixtures
- [ ] Fixtures support at minimum: mine, assigned to another user, unassigned, conflict, open Peer Check / no peerChecker where applicable
- [ ] Fixture state can be restored to a known baseline between runs
- [ ] Maestro asserts mine / other / unassigned ownership UI
- [ ] Maestro asserts `record-taken-warning`
- [ ] Maestro proves online first-recording auto-claim using disposable/resettable data
- [ ] Claim updates ownership UI immediately
- [ ] Tests do not mutate shared developer/QA data
- [ ] Fixture/seed/reset requirements are documented in the Maestro guide
- [ ] Existing #532 audit scenarios that were BLOCKED/SKIPPED because of missing fixtures can be executed deterministically

## Related

- GitHub issue: [#574](https://github.com/eten-tech-foundation/fluent-mobile/issues/574)
- Parent audit: [#532](https://github.com/eten-tech-foundation/fluent-mobile/issues/532)
- Epic: [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526)
- Assessment: `docs/assessments/chapter-assignment-and-claiming/`
- Historical / related: #267, #268, #269, #270, #271, #442, #476, #533
