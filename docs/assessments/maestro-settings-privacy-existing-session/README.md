# Settings Privacy (existing session) — read-only

## Why this path

| Ledger | Coverage |
|--------|----------|
| `.maestro/flows/edges/legal-pages.yaml` | Login footer links + `ensure-on-login` (signed-out) |
| This flow | Drawer `settings-menu-privacy-policy` while **logged in** |

Supported by source: `settings-menu-privacy-policy`; `privacy-policy-scroll` /
`privacy-policy-scroll-back` (`LegalDocumentLayout`).

Separate from frozen Sync/PFO six-path checkpoint (helpers only **used**, not edited).

## Command

```bash
maestro test .maestro/flows/edges/settings-privacy-existing-session.yaml
```

## ONE focused PASS (inlined)

| Field | Value |
|-------|--------|
| Date / time | 2026-10-19 ~18:09–18:10 PDT (`2026-10-20T01:09:37Z`–`01:10:09Z`) |
| Agent | `bc-9c8695db-e3d3-4df1-bdbb-e0caa02685f0` |
| HEAD | `c81bd86` |
| Device | `emulator-5554`, PID **7152** |
| Outcome | **PASS** `EXIT=0` (~**32s**) |
| Session | `active_user_id=10`, `userId=10` before/after |
| Assertions | drawer Privacy → `privacy-policy-scroll` → `privacy-policy-scroll-back` → Home; login absent |
| Not done | Terms route (sibling unproven but stopped after one legal check); no accept/account/login |

Debug (not git): `/tmp/maestro-privacy-out/`, `/tmp/maestro-privacy-run.log`

## Body-rendering follow-up — 2026-10-20

The earlier Maestro open/back PASS above remains historical evidence. The current flow adds first/final body-text assertions; its new Maestro body variant is **not PASS** (Privacy timed out at drawer entry; Terms not attempted). Separately, [direct-device functional checks](../maestro-acceptance-coverage/evidence/legal-functional-checks.json) verify this page opens, its body renders, and header Back returns Home while preserving active12/cached10,9,12. Component tests verify body text and router callbacks independently. Policy wording is unchanged; #725 is a separate Privacy copy defect. No actual scroll delta is claimed.
