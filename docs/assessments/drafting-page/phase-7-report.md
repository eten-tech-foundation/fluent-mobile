# Phase 7 — Drafting page audit report (#527)

**Date:** 2026-09-22  
**Sub-issue:** [#527](https://github.com/eten-tech-foundation/fluent-mobile/issues/527)  
**Epic:** [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526)  
**Assessment:** [docs/assessments/drafting-page/README.md](./README.md)

## Verdict

**Pass with gaps** — drafting shell mostly verified; one medium gap filed as [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) (`onOpenRecord` ignored after Bible pericope rewrite).

## What was verified

- Entry: My Work and Projects → drafting
- Chrome: header sync control, Bible / Resources / Record tab bar
- Source-audio bar visible on Bible/Record, hidden on Resources
- Shared selected verse (Bible select → Record tab → Resources)
- In-session last-tab restore
- Recording leave guards (tab switch + system back)
- Observational offline banner on shell

## Automation left behind

- `.maestro/flows/android/smoke-drafting.yaml` (`smoke` + `drafting` + `nav`)
- `npm run maestro:test:drafting`
- Docs: `docs/guides/maestro.md` journey map + flow table
- Local Debug: empty Dev Client launcher after `clearState` deep-links via `dismiss-expo-dev-menu.yaml`

## Gaps / issues filed

- [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) — Restore Bible tab `onOpenRecord` (task: `tickets/restore-bible-onOpenRecord.md`)

## Residual manual

- Nightly APK exploratory polish
- Full offline/sync and Record capture journeys (sibling audits)
- Background/resume persistence beyond in-session memory
