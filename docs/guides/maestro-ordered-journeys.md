# Ordered Maestro journeys

`scripts/maestro-test.sh` (and the QA entrypoint `scripts/maestro-test-qa.sh`)
already accept multiple positional flows in one CLI invocation. Positional
argument order alone does not establish Maestro execution order or a compatible
starting state.

For an explicitly ordered, compatible journey, pass `--flow-list PATH`. The file
contains one YAML path per line, resolved relative to that list file; blank lines
and full-line `#` comments are ignored. Duplicate entries and missing files fail
before ADB. For example, a reviewed list can contain one setup flow followed by
criterion fragments that keep their own positive assertions. The wrapper
generates one temporary parent with ordered `runFlow` commands and invokes the
Android Maestro runner once.

```sh
bash scripts/maestro-test-qa.sh --flow-list /path/to/reviewed-journey.txt \
  --test-output-dir /path/to/artifacts
```

The same env selection (QA API pin under the QA entrypoint) and fixture
preflight apply before device selection. Ordered mode additionally walks static
nested `runFlow` files, including conditional branches, without executing
scripts; static `runScript` paths must exist. Missing or dynamic paths, cycles,
and nested fixture-context parameter changes (`FIXTURE`, `DISPOSABLE`,
`INCOMPLETE`, `A` and `B` aliases) fail closed. YAML anchors, aliases and
unsupported dependency syntax also fail closed. Action-bearing fragments must
declare a reviewed `ordered-readonly` or `mutating` tag; assertion-only
fragments need neither. Cold-start, capture and reset commands (`launchApp`,
`clearState`, `clearKeychain`, `startRecording`, `stopRecording`) are rejected
in ordered mode. All reachable child tags are checked, so a parent cannot hide a
mutating child behind its own tags. Static traversal is not proof of role,
stage, resource readiness or permission; flows must still assert actual device
state.

Ordered mode rejects positional flows alongside the list, tag filters,
device/platform overrides and sharding. Select the device with `ANDROID_SERIAL`.
The wrapper does not lock the device, switch accounts or restore application
state. It removes its temporary parent on success or failure and keeps the
existing artifact scrubbing.

Do not concatenate flows that assume unrelated starting states. Keep cold-start,
login/reset and recovery cases as independent runs. The stub tests in
`scripts/maestro-test-ordered.test.cjs` cover ordering, the single launch and
guard behavior only.
