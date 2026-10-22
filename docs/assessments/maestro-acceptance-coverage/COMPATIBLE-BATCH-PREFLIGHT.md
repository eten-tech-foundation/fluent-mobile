# Compatible-batch preservation / preflight procedures (#717)

Portable operator procedures for **existing-session** Maestro work. This document
records proven practice already used by criterion host wrappers; it does **not**
add a new runner, plan schema, or offline validator framework.

**Refs #717** (documentation subtask only — does **not** close #717).

**Needs QA?** No — engineering-only procedures documentation.

Criterion packets remain on their issue-linked PRs (for example D0702 on PR
`#755` / `#702`, PFO size admission on PR `#759` / `#758`). Do not duplicate
those tests or provenance here.

## What this document is not

- Not whole #717 coverage completion.
- Not proof that any criterion passed on a device.
- Not a unit-test or CI green certificate for runtime behavior.
- Not a claim that B-lane two-take native capture or Maestro automation passed.
  Device overruns (for example ~50s / ~69s saved takes) remain outside any
  absolute ≤30s hardcap. Generic host helpers below are unit-proven only.
- Not a parallel batch-plan language or receipt-schema invention beyond what
  existing host runners already emit.

## Generic bounded-stop host helpers (unit-only)

Reusable host components under `scripts/qa717-easy-ui-batch/` (no device I/O in
the modules themselves; callers inject bridges):

| File | Role |
| --- | --- |
| `capture_bounded_stop_guard.py` | Admit → arm host monotonic deadline → fresh-dump Stop; real `time.monotonic` default clock (avoids TypeError when no FakeClock injected). |
| `capture_stop_readiness.py` | Fail-closed `safe_dump` (no uncaught `TimeoutExpired`) and `readiness_valid_for_root_start` expiry gate so root does not late-Start after readiness ages out. |
| `capture_root_start_readiness.py` | Select ROOT start control: idle `record-start-button` **or** review `record-new-take-button`; reject Stop/Pause/wrong verse/ambiguous both. Caller supplies expected verse label (no target pins). |

Focused tests: `capture_bounded_stop_guard.test.py`, `capture_stop_readiness.test.py`,
`capture_root_start_readiness.test.py` (`python3 <file> -v`). These do **not** prove
native capture automation PASS or drawer (B0016) criteria. Target-pinned B adapters
and post-READY single-UIA-owner watch loops stay out of this packet until sanitized.
Related audit criteria: Refs #568 / #569 (non-closing); this packet Refs #717.

## Proof classes (keep separate)

| Class | Meaning |
| --- | --- |
| **Unit / authoring** | Static contracts, FakeBridge host tests, Graal/YAML gates. Green here does **not** mean a device pass. |
| **Native / device** | A dated host receipt from an intentional `--execute` (or equivalent) on an owned serial, with honest `runtime_pass_claimed`. |
| **Repeatability** | A later head is not proven by an older device stamp. Re-run only when intentionally validating that head; never overwrite prior evidence directories. |

Reading this document does **not** promote any class into another.

## Compatible-batch invocation (existing entrypoints)

Use the repository’s existing Maestro / host entrypoints. Do not invent a second
batch planner.

1. **Explicit serial** — export or pass one owned `ANDROID_SERIAL` (example
   placeholder: `emulator-NNNN`). Do not rely on implicit multi-device
   selection.
2. **Unique artifact paths** — every case gets a fresh evidence / test-output
   directory. Never reuse or overwrite a prior receipt directory.
3. **One owned device lane** — serialize mutating work on that serial; do not
   start a second uncertain batch on the same device.
4. **Repository-relative flow paths** — point at tracked `.maestro/flows/...`
   paths from the repo root in public notes; keep absolute host paths out of
   published docs and committed receipts.

Safe command **shape** (placeholders only; not a directive to re-run a passing
case for packaging):

```bash
ANDROID_SERIAL="<owned-serial>" bash scripts/maestro-test.sh \
  --test-output-dir "<unique-evidence-dir>" \
  .maestro/flows/<area>/<existing-session-flow>.yaml
```

Where a criterion already ships an external-finally host wrapper (PR `#755`
pattern), invoke that wrapper with an explicit serial and a fresh evidence
directory instead of inventing a new orchestrator. Example **shape** only:

```bash
python3 scripts/qa717-easy-ui-batch/run-<criterion>-a5554-external-finally.py \
  --serial "<owned-serial>" \
  --evidence-dir "<unique-evidence-dir>" \
  --execute
```

Omit `--execute` for dry / authoring paths when the wrapper supports that. Do
not treat dry-run or unit green as a native pass.

## Inspect `launchApp` defaults before read-only claims

Before calling any flow that wraps `launchApp`, read the flow (and shared
helpers it runs) for default **clear-state / restart / permissions** behavior.
A wrapper that clears app state is incompatible with “existing-session /
read-only / preserve cache” intent. Prefer the existing-session flow variant
already authored for that criterion; do not retune global animation waits as a
substitute for correct readiness.

## Guarded side-effect readiness

Prepare before any intentional Download / Start / capture / mutating Sync:

1. Confirm no other owner is mid-run on the same serial.
2. Require host **preflight** success for closed Home (and any criterion-specific
   baseline the existing wrapper already checks) **before** the side effect.
3. If preflight fails or readiness is uncertain, **do not Start** and do not
   invent a second attempt that clears state.
4. After the feature attempt, let the host **finally** path restore closed Home
   / intended active account / protected preferences and takes when that wrapper
   already implements those steps.

## Existing external-finally host receipt keys (PR `#755` shape)

PR `#755` host runners emit a JSON object (commonly named like
`host-runner-result.json` under the chosen evidence directory). Public docs and
committed extracts should keep only sanitized summaries. Observed top-level and
nested keys used for preservation honesty include:

| Key | Role |
| --- | --- |
| `schema` | Criterion-specific string (example shape: `<criterion>-a5554-external-finally/v1`). Identifies the emitter; not a second global plan format. |
| `criterion` | Audit criterion id for that wrapper. |
| `serial` | Device serial used for the attempt. |
| `flow` | Repository-relative Maestro flow path. |
| `execute` | Whether the host was asked to run Maestro. |
| `flowSha256` | Hash of the flow content for that attempt. |
| `bridge` | Host bridge implementation label (for example `AdbBridge` or a unit `FakeBridge`). |
| `baselineOk` | Host baseline gate before/around the feature attempt. |
| `preflight` | Object with `ok`, `error`, `log` (log entries may include `closed_home`). |
| `maestroExit` | Process exit from Maestro when invoked. |
| `finally` | Object with `ok`, `log` (log entries may include `closed_home` and restoration steps). |
| `runtime_pass_claimed` | Boolean honesty flag for the **feature** journey. |
| `beforePrefs` / `afterPrefs` | Preference snapshots used by the host (publish only sanitized aggregates). |
| `beforeTakes` / `afterTakes` | Take inventory snapshots (publish counts/hashes only; no private paths). |
| `cacheProbe` | Cache/account probe summary used by the host. |
| `expectedTakeCounts` | Expected protected take counts for the baseline. |
| `prefsUnchanged` / `outcome` / related notes | Wrapper-specific result fields — interpret per that PR’s receipt docs. |

### Honesty rules (existing practice)

- `runtime_pass_claimed: true` is only appropriate when the intended feature
  journey **and** preservation finally both succeeded, with `maestroExit` 0 when
  Maestro was required.
- Closed Home in `finally.log` after a non-zero `maestroExit` is **cleanup
  success**, not a feature pass — keep `runtime_pass_claimed: false`.
- Authoring-gate green on a later git head does not inherit an older device stamp.

## Publication sanitization

Before attaching or committing operator notes derived from runs: strip QA emails,
fixture identifiers that are not already public placeholders, signed URL query
markers, credentials, private absolute host paths, and raw UI / log dumps. Prefer
relative evidence directory names and redacted summaries.

## Related ownership (do not duplicate here)

- PR `#755` — D0702 flows, external-finally runner, Graal gate, durable receipts.
- PR `#759` — PFO size admission, fixture-guard packaging, C0051 packet.
- Aggregate ledgers / FAST_TRACK counts — separate ownership; not modified by
  this documentation packet.

Future root receipts may extend these **procedures** with additional dated
evidence under the same honesty rules. That is continual incorporation of
operator practice, not authorization to invent a parallel plan schema in this
tree.
