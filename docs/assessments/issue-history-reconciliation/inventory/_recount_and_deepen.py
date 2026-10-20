#!/usr/bin/env python3
"""RETIRED — fail-closed. Do not use for coverage.csv updates.

This entrypoint previously performed keyword / body-length / closed-state
"semantic completion" of reconciliation rows. That mechanism was rejected:
it overwrote evidence-backed rows and falsely marked reconciliation_complete.

Historical source (quarantined, not executable as the active path):
  inventory/provenance/retired-semantic-completion-scripts/_recount_and_deepen.py

Allowed: read-only counting via inventory/_count_completion_readonly.py
(reads reconciliation_complete / disposition_review fields only; never writes).

Integrator: bc-da4aa327-d86e-47fc-93c0-d7105af39497
Retired_utc: 2026-10-20T01:07:28Z
"""
from __future__ import annotations
import sys

_MSG = (
    "RETIRED: _recount_and_deepen.py is permanently fail-closed.\n"
    "Semantic completion by keyword/body-length/closed-state is forbidden.\n"
    "Quarantine: inventory/provenance/retired-semantic-completion-scripts/_recount_and_deepen.py\n"
    "Counts only: python3 inventory/_count_completion_readonly.py\n"
)
sys.stderr.write(_MSG)
raise SystemExit(2)
