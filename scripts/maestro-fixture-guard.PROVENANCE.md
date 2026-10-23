# maestro-fixture-guard.cjs — packaging provenance (issue #51)

## Baseline (prerequisite)

| Field | Value |
|-------|-------|
| Source commit | `d2da6fece7e5b7e0bc0dd8cb19836ec992db36b1` |
| Short | `d2da6fece` (504 lines tracked `scripts/maestro-fixture-guard.cjs`) |
| Message | `test(maestro): add ordered journeys and exhaustive list markers (#717)` |
| Path | `scripts/maestro-fixture-guard.cjs` |
| Relation to 755 | **Not** an ancestor of `753aecd8` (PR755 / D-0702 head) |

Vendored into this worktree as the **source baseline** before the admission delta.
Do **not** silently replace this with the full 717 integration tip (extra capture-root
exceptions, ordered-journey docs, `maestro-test.sh` wiring, unrelated flows).

## Delta in this packet (issue #51 only)

- Tag `pfo-download` admission path (default deny unchanged for other mutating flows)
- Env: `MAESTRO_PFO_DOWNLOAD_ADMISSION` + `MAESTRO_PFO_DOWNLOAD_MANIFEST`
- Static manifest + flow-body constraints (project13 / PM9 / Matthew1 / ≤5MiB bound / no forbidden mutations)
- Observed-size completeness: unknown/`0 B` network rows → `NONADMISSIBLE` (UI aggregate alone is not admission)

Live worktree guard ≈998 lines ≈504 baseline + ~494 pfo-only delta.

## Packaging options for root

1. **Preferred:** Land 717 guard prerequisite (exactly commit `d2da6fece7e5b7e0bc0dd8cb19836ec992db36b1` guard file, 504 lines) on the stack base, then cherry-pick / apply **only** the pfo-download admission hunk + C-0051 flows/host.
2. **Alternate:** Ship vendored baseline+delta in the #51 PR with this provenance file and an explicit PR note that the guard file is a scoped prerequisite, not a 717 tooling sweep.

Host invokes preflight directly; 755 `maestro-test.sh` has no guard hook — do not
pull unrelated `maestro-test.sh` ordered-journey changes unless root coordinates.

## Not claimed

- General 5 MB download safety for arbitrary catalogs
- Independent pre-download size oracle
- Device / Maestro execute readiness for the original 2.4 MB + Images `0 B` fixture
