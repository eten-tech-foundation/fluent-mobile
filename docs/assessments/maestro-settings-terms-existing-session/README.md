# Settings Terms of Use (existing session) — read-only

## Why this path

| Ledger | Coverage |
|--------|----------|
| `edges/legal-pages.yaml` | Login footer Terms + `ensure-on-login` |
| `settings-privacy-existing-session` | Drawer Privacy (frozen after PASS) |
| This flow | Drawer `settings-menu-terms-of-use` while **logged in** |

Source: `settings-menu-terms-of-use`; `terms-of-use-scroll` /
`terms-of-use-scroll-back`. Document view only — no accept/agree step in UI
path used here.

## Command

```bash
maestro test .maestro/flows/edges/settings-terms-existing-session.yaml
```

## ONE focused PASS (inlined)

| Field | Value |
|-------|--------|
| Date / time | 2026-10-19 ~18:13 PDT (`2026-10-20T01:13:13Z`–`01:13:44Z`) |
| Agent | `bc-9c8695db-e3d3-4df1-bdbb-e0caa02685f0` |
| HEAD | `c81bd86` |
| Device | `emulator-5554`, PID **7152** (unchanged) |
| Outcome | **PASS** `EXIT=0` (~**31s**) |
| Session before/after | `active_user_id=10`, `userId=10`, `userEmail=qa+fluentqa-translator@fluent.local` |
| Assertions | Terms scroll visible → `terms-of-use-scroll-back` → Home; login absent |
| Agreement accept | **Not required / not performed** |

Frozen after this PASS (with Privacy two-path). Sync/PFO six untouched.

## Body-rendering follow-up — 2026-10-20

The earlier Maestro open/back PASS above remains historical evidence. The current flow adds first/final body-text assertions; its new Maestro body variant is **not PASS** (Privacy timed out at drawer entry; Terms not attempted). Separately, [direct-device functional checks](../maestro-acceptance-coverage/evidence/legal-functional-checks.json) verify this page opens, its body renders, and header Back returns Home while preserving active12/cached10,9,12. Component tests verify body text and router callbacks independently. Policy wording is unchanged; #725 is a separate Privacy copy defect. No actual scroll delta is claimed.
