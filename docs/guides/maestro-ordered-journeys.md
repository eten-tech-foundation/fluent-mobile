# Ordered Maestro journeys

The existing `scripts/maestro-test-qa.sh` already accepts multiple positional
flows in one CLI invocation. Positional argument order alone does not establish
Maestro execution order or compatible starting state.

For an explicitly ordered, compatible journey, pass `--flow-list PATH`. The file
contains one YAML path per line, resolved relative to that list file; blank lines
and full-line `#` comments are ignored. Duplicate entries and missing files fail
before ADB. For example, an owner-reviewed list can contain a single account,
mode and chapter setup flow followed by criterion fragments that retain their
own positive assertions. The wrapper generates one temporary parent with ordered
`runFlow` commands and invokes the existing Android Maestro runner once.

```sh
bash scripts/maestro-test-qa.sh --flow-list /path/to/reviewed-journey.txt \
  --test-output-dir /path/to/artifacts
```

The same QA API pin and fixture preflight apply before device selection. Ordered
mode additionally walks static nested `runFlow` files, including conditional
branches, without executing scripts; static `runScript` paths must exist. Missing/dynamic paths, cycles and nested
fixture-context parameter changes (FIXTURE, DISPOSABLE, INCOMPLETE, A and B aliases) fail closed. YAML anchors, aliases and unsupported dependency syntax also fail closed. Action-bearing fragments must explicitly declare owner-reviewed `ordered-readonly` or `mutating` tags; assertion-only fragments need neither. Capture/reset/auth entry commands remain independent and are rejected in ordered mode. All reachable child tags are checked,
so a parent cannot hide a mutating child behind its own tags. Existing native
fixture scripts must still validate actual device state; this static traversal
is not proof of role, stage, resource readiness or permission.

Ordered mode rejects positional flows alongside the list, tag filters,
device/platform overrides and sharding. Set the existing `ANDROID_SERIAL` to the
exclusive owner's device. The existing Python owner keeps its lock, outer
preflight and `finally` restoration; this shell wrapper does not acquire a second
owner, switch accounts or restore application state. It removes its temporary
parent on success or failure and retains existing artifact scrubbing.

Do not concatenate flows that assume unrelated starting states. Keep cold-start,
login/reset and recovery cases independent. An eligible fixture and owner review
are required before a live comparison. Stub tests establish ordering, one launch
and guard behavior only; neither them nor the incomplete LOW_MEMORY benchmark
establish a performance saving. No `--analyze`, HTML reporting, daemon or session
pool is added.
