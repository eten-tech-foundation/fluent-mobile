#!/usr/bin/env python3
"""Read-only completion counters for coverage.csv.

Reads disposition_review / reconciliation_complete fields only.
Never writes coverage.csv. Never asserts semantic completion.
"""
from __future__ import annotations
import csv
import json
import sys
from pathlib import Path

COV = Path(__file__).resolve().parents[1] / "coverage.csv"


def main() -> int:
    rows = list(csv.DictReader(COV.open(encoding="utf-8")))
    disp = sum(1 for r in rows if r.get("disposition_review") == "yes")
    comp = sum(1 for r in rows if r.get("reconciliation_complete") == "yes")
    out = {
        "ledger_rows": len(rows),
        "disposition_review_yes": disp,
        "reconciliation_complete_yes": comp,
        "awaiting_reconciliation_depth": sum(
            1
            for r in rows
            if r.get("disposition_review") == "yes"
            and r.get("reconciliation_complete") != "yes"
        ),
        "no_disposition_yet": sum(
            1 for r in rows if r.get("disposition_review") != "yes"
        ),
        "reconciliation_complete_ids": sorted(
            int(r["issue"])
            for r in rows
            if r.get("reconciliation_complete") == "yes"
        ),
        "note": "Read-only counts. Semantic completion requires integrator contract review.",
    }
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
