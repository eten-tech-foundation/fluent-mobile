# Maestro existing-session navigation (read-only)

Coverage for an **already authenticated** device session (e.g. QA user10).
No login, clearState, cold helpers, downloads, sync-start, or preference
toggles in these flows.

## Preconditions

- App running, logged in, Home reachable (or only stack screens recoverable
  via `goto-home` / `ensure-no-modal`).
- `goto-home` → `ensure-no-modal` may **navigate away** from Sync / Prepare
  Offline / drawer to recover Home. That is not `clearState` and not login,
  but it is **not** full UI-stack immutability.
- `ensure-no-modal` dismisses `prepare-offline-screen` with **`stack-header-back`
  only** (system Back can overshoot to the Android launcher). `goto-home` does
  **not** add a separate PFO `back` branch for that reason.
- Do **not** use `ensure-warm-session` here (can Discard recovered-recording
  alerts and run `login-translator`).

## Sync entry (#721 automation) — distinct docs

Tracked Sync automation (causal uncertainty retained there; not re-stated as
proven product defect):

- Assessment: `docs/assessments/maestro-sync721/README.md`
- Tracked flow: `.maestro/flows/sync/sync-entry-existing-session.yaml`
- TEMP diagnostic that **passed** (not the tracked path name):
  `.maestro/flows/qa-warm-temp/sync-once.yaml` — EXIT=0 ~61s on 2026-10-19;
  promotion to tracked flow was path-only (no Sync re-run required).

## Prepare Offline entry → back (this assessment)

| Item | Detail |
|------|--------|
| Gap vs ledger | `sync/prepare-offline-entry.yaml` opens PFO then continues into **project-row + resources/download chrome** — not entry→back only. |
| Flow | `.maestro/flows/offline/prepare-offline-entry-existing-session.yaml` |
| Path | Home → Settings → `settings-prepare-offline` → `prepare-offline-screen` → `stack-header-back` → Home |
| Forbidden | download button, project pick, cellular toggles, password/account controls |

```bash
maestro test .maestro/flows/offline/prepare-offline-entry-existing-session.yaml
```

### ONE focused PASS (inlined — do not re-run for freeze)

| Field | Value |
|-------|--------|
| Date / time | 2026-10-19 ~18:04–18:05 PDT (`2026-10-20T01:04:38Z`–`01:05:31Z` wall) |
| Agent | `bc-9c8695db-e3d3-4df1-bdbb-e0caa02685f0` |
| HEAD | `c81bd86` |
| Device | `emulator-5554`, `com.eten.fluent` PID **7152** |
| Env | QA session; `.env` API `https://qa.api.fluent.bible` (no login this pass) |
| Outcome | **PASS** `EXIT=0` (~**52s**) |
| Session before/after | `active_user_id=10`, `userId=10`; not on login |
| Assertions observed | `prepare-offline-screen` visible; `stack-header-back` tap; `home-tab-my-work` visible; `login-email-input` not visible |
| Downloads / toggles | **None** (no project-row, no download footer tap, no pref switches) |
| Debug (not git) | `/tmp/maestro-pfo-out/`, `/tmp/fluent-maestro-existing-session-pfo.md` |

## Frozen six-path checkpoint

See freeze allowlist in `/tmp/fluent-six-path-freeze.md` (no git ops). Paths:

1. `.maestro/shared/nav/goto-sync.yaml`
2. `.maestro/shared/nav/goto-home.yaml`
3. `.maestro/flows/sync/sync-entry-existing-session.yaml`
4. `.maestro/flows/offline/prepare-offline-entry-existing-session.yaml`
5. `docs/assessments/maestro-sync721/README.md`
6. `docs/assessments/maestro-existing-session/README.md`
