// Fixture my-work row id regex — Maestro runScript (plain JS).
// Installed engine (2.10.0): complex concat/regex via inline evalScript leaves
// output.* undefined; external runScript exports primitive strings reliably.
// Reads already-normalized output.fixtureChapterId; ordinary regex escaping.

output.myWorkRowIdRe =
  (output.fixtureChapterId === undefined || output.fixtureChapterId === null || String(output.fixtureChapterId).trim().length === 0)
    ? ''
    : ('^my-work-row-' + String(output.fixtureChapterId).trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$');
