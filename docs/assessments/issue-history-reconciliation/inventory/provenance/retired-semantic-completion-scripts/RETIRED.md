# Retired semantic-completion scripts

**Retired:** 2026-10-20T01:07:28Z  
**Owner:** audit integrator `bc-da4aa327-d86e-47fc-93c0-d7105af39497`

## Why

These scripts asserted `reconciliation_complete=yes` from keywords, closed state,
body length, or generic docs pointers. Supervisor rejected that mechanism after
it produced false 308/308 completion and overwrote genuine evidence.

## Active entrypoints

`inventory/_deepen_product_pending.py` and `inventory/_recount_and_deepen.py` are
**RETIRED stubs**: they always exit **2** and write nothing.

## Quarantine

Full historical sources live in this directory for provenance only. Do not
restore them as the active path without an explicit human waiver.

## Safe counting

Use `inventory/_count_completion_readonly.py` — reads CSV fields only, never
asserts semantics or writes `coverage.csv`.
