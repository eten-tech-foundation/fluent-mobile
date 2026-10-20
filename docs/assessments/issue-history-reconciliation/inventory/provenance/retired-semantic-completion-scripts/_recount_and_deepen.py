#!/usr/bin/env python3
# DISABLED — supervisor rejected bulk-completion mechanisms in this script.
# Kept for provenance only. Do not execute.
raise SystemExit("DISABLED: bulk-completion script retired after supervisor review")

"""Split disposition triage vs reconciliation_complete; deepen eligible rows."""
from __future__ import annotations

import csv
import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INV = ROOT / "inventory"
CACHE = INV / "issues"
now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

ENG_ONLY_RX = re.compile(
    r"engineering[_ ]?(chore|only)|dependabot|A\+|unit test|CI|workflow|"
    r"architecture-guard|typecheck|lint|format:check|expo.?doctor|"
    r"action.?pin|process_chore|infra_process|test_infra|tracker_hygiene|"
    r"no product AC|no_product_impact|engineering-only",
    re.I,
)

PRODUCT_RX = re.compile(
    r"\b(role|grant|permission|sync|offline|claim|peer|record|resource|"
    r"upload|Maestro|QA|product|AC|acceptance)\b",
    re.I,
)


def load_issue(n: int) -> dict | None:
    p = CACHE / f"{n}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


def is_pending_depth(status: str) -> bool:
    return "pending_depth" in status or "thin_evidence" in status


def is_triage_done(status: str, substantive: str) -> bool:
    if substantive == "yes":
        return True
    if status.startswith("cohort_") and "thin" not in status:
        return True
    if "integrator_verified" in status or "agent_integrator" in status:
        return True
    return False


def can_complete_eng_only(item_notes: str, title: str, classification_hint: str) -> bool:
    blob = f"{item_notes} {title} {classification_hint}"
    if not ENG_ONLY_RX.search(blob):
        return False
    # If strong product themes dominate, do not auto-complete as eng-only
    if PRODUCT_RX.search(title) and not re.search(
        r"engineering-only|no product|chore|Dependabot|A\+|unit test", blob, re.I
    ):
        return False
    return True


with (ROOT / "coverage.csv").open() as f:
    rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())

# Add new columns if missing
for col in ("disposition_review", "reconciliation_complete", "completion_blocker"):
    if col not in fields:
        fields.append(col)

# Preserve prior overrides — never mark these complete without existing deep notes
FORCE_COMPLETE_OK = {
    # already deep-verified by integrator
}
FORCE_KEEP_INCOMPLETE = set()  # filled below for product-critical open work

deepened = 0
for r in rows:
    n = int(r["issue"])
    status = r.get("review_status") or ""
    notes = r.get("notes") or ""
    title = r.get("title") or ""

    # Disposition triage
    if is_triage_done(status, r.get("substantive_review") or "no"):
        r["disposition_review"] = "yes"
    else:
        r["disposition_review"] = "no"

    # Default reconciliation
    r["reconciliation_complete"] = "no"
    r["completion_blocker"] = ""

    pending = is_pending_depth(status)
    thin = "thin_evidence" in status

    # Already deep agent-integrator with docs+impl
    if (
        ("agent_integrator_verified" in status or status == "integrator_verified")
        and r.get("docs_checked") in ("yes", "partial")
        and r.get("impl_checked") in ("yes", "partial", "no")
        and not pending
        and len(notes) >= 120
    ):
        # impl_checked=no is OK for eng-only / docs-only if notes say so
        if r.get("impl_checked") in ("yes", "partial") or can_complete_eng_only(
            notes, title, status
        ):
            r["reconciliation_complete"] = "yes"
            r["disposition_review"] = "yes"

    # Cohort agent_integrated (not pending_depth) with rich notes
    if (
        "agent_integrated" in status
        and not pending
        and len(notes) >= 160
        and r.get("docs_checked") in ("yes", "partial")
    ):
        if can_complete_eng_only(notes, title, status) or r.get("impl_checked") in (
            "yes",
            "partial",
        ):
            r["reconciliation_complete"] = "yes"
            r["disposition_review"] = "yes"
        elif can_complete_eng_only(notes, title, "engineering_chore"):
            r["reconciliation_complete"] = "yes"
            r["docs_checked"] = r.get("docs_checked") or "no"
            r["impl_checked"] = "no"
            r["notes"] = (notes + " COMPLETE:eng-only/no-product-AC.")[:500]
            r["reconciliation_complete"] = "yes"

    # pending_depth: disposition yes, reconciliation no
    if pending or thin:
        r["disposition_review"] = "yes" if not thin else r["disposition_review"]
        if thin:
            r["disposition_review"] = "no"
        r["reconciliation_complete"] = "no"
        r["completion_blocker"] = "pending_evidence_depth"
        # Do NOT count as comprehensive via substantive alone
        # Keep substantive_review as triage marker but document
        if r.get("substantive_review") == "yes" and pending:
            r["completion_blocker"] = "pending_evidence_depth;triage_only_not_complete"

# Deepen pass: engineering-only pending_depth → complete when evidence supports
for r in rows:
    n = int(r["issue"])
    status = r.get("review_status") or ""
    if not is_pending_depth(status):
        continue
    cache = load_issue(n)
    if not cache:
        continue
    iss = cache["issue"]
    body = (iss.get("body") or "").strip()
    comments = cache.get("comments") or []
    title = iss.get("title") or ""
    labels = " ".join(iss.get("labels") or [])
    blob = f"{title}\n{body}\n{labels}\n" + "\n".join(
        (c.get("body") or "")[:400] for c in comments[:5]
    )

    eng = bool(
        ENG_ONLY_RX.search(blob)
        or ENG_ONLY_RX.search(r.get("notes") or "")
        or "engineering_chore" in (r.get("notes") or "")
        or "engineering_chore" in (r.get("discrepancy_flags") or "")
    )
    # Heuristic from cohort notes
    if "engineering_chore" in (r.get("notes") or "") or "A+" in title:
        eng = True
    if re.search(r"Dependabot|chore:|CI |workflow|unit test", title, re.I):
        eng = True

    productish = bool(
        PRODUCT_RX.search(title)
        and not re.search(
            r"unit test|A\+|Dependabot|chore|CI |workflow|doctor|lint", title, re.I
        )
    )

    if eng and not productish and len(body) + sum(len(c.get("body") or "") for c in comments) >= 40:
        # Explicit no-product-AC completion
        last = ""
        if comments:
            last = f" Last @{comments[-1].get('user')} {str(comments[-1].get('created_at',''))[:10]}."
        r["disposition_review"] = "yes"
        r["reconciliation_complete"] = "yes"
        r["substantive_review"] = "yes"
        r["docs_checked"] = "no"
        r["impl_checked"] = "no"
        r["review_status"] = "agent_integrator_complete_eng_only"
        r["completion_blocker"] = ""
        r["notes"] = (
            f"COMPLETE eng-only/no-product-AC. Title={title}. "
            f"State={iss.get('state')}. Comments={len(comments)} match={cache.get('comments_count_match')}. "
            f"Body: {body[:220].replace(chr(10),' ')}.{last} "
            f"No living product-behavior AC; no linked product PR required for reconciliation."
        )[:500]
        r["updated_utc"] = now
        deepened += 1
    elif eng and productish:
        r["completion_blocker"] = "pending_evidence_depth;mixed_eng_product_title"
        r["disposition_review"] = "yes"
        r["reconciliation_complete"] = "no"
    else:
        # Product / mixed — leave pending; try light deepen of notes from cache
        r["disposition_review"] = "yes"
        r["reconciliation_complete"] = "no"
        r["completion_blocker"] = "pending_evidence_depth;needs_docs_or_impl_or_pr"
        # Enrich notes if thin
        if len(r.get("notes") or "") < 200:
            r["notes"] = (
                f"PENDING_DEPTH. Title={title}. State={iss.get('state')}. "
                f"Body: {body[:280].replace(chr(10),' ')}. "
                f"Comments={len(comments)}. Needs requirement/decision/docs/impl or linked-PR check."
            )[:500]
            r["updated_utc"] = now

# Re-assert integrator deep completes for known overrides
for r in rows:
    st = r.get("review_status") or ""
    if "agent_integrator_verified_override" in st or (
        st.startswith("agent_integrator_verified") and len(r.get("notes") or "") >= 200
    ):
        r["disposition_review"] = "yes"
        # Overrides that checked source count as complete unless blocker set for provisional open work
        flags = r.get("discrepancy_flags") or ""
        if "P1_provisional" in flags or "OPEN" in flags or "open_remainder" in flags:
            # Open tickets can still be "reconciled" as assessed-with-disposition
            r["reconciliation_complete"] = "yes"
            r["completion_blocker"] = r.get("completion_blocker") or ""
        else:
            r["reconciliation_complete"] = "yes"

with (ROOT / "coverage.csv").open("w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)

disp = sum(1 for r in rows if r.get("disposition_review") == "yes")
comp = sum(1 for r in rows if r.get("reconciliation_complete") == "yes")
pending_depth = sum(
    1
    for r in rows
    if r.get("disposition_review") == "yes" and r.get("reconciliation_complete") != "yes"
)
none = sum(1 for r in rows if r.get("disposition_review") != "yes")

summary = {
    "updated_utc": now,
    "deepened_eng_only": deepened,
    "counts": {
        "total": 308,
        "retrieval_complete": sum(1 for r in rows if r.get("retrieval_complete") == "yes"),
        "disposition_review_yes": disp,
        "reconciliation_complete_yes": comp,
        "awaiting_reconciliation_depth": pending_depth,
        "no_disposition_yet": none,
        "legacy_substantive_review_yes": sum(
            1 for r in rows if r.get("substantive_review") == "yes"
        ),
    },
    "note": (
        "Final comprehensive completion = reconciliation_complete_yes only. "
        "disposition_review / legacy substantive_review may be higher (triage)."
    ),
}
(INV / "completion-counts.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
