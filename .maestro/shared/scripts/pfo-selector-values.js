// PFO selector/copy values: plain Maestro runScript. No I/O.
// Runs once per phase in one flow; Maestro reuses the JS context, so a
// top-level const/let would throw on redeclaration.
// eslint-disable-next-line no-var
var phase = typeof MAESTRO_PFO_SELECTOR_PHASE === "undefined" ? "setup" : String(MAESTRO_PFO_SELECTOR_PHASE);
if (phase === "setup") {
output.fixtureProjectId = (typeof MAESTRO_FIXTURE_PROJECT_ID === 'undefined' || MAESTRO_FIXTURE_PROJECT_ID === null) ? '' : String(MAESTRO_FIXTURE_PROJECT_ID).trim();
output.pfoBookName = (typeof MAESTRO_PFO_BOOK_NAME === 'undefined' || MAESTRO_PFO_BOOK_NAME === null) ? '' : String(MAESTRO_PFO_BOOK_NAME).trim();
output.projectRowIdRe = output.fixtureProjectId.length > 0 ? ('^project-row-' + String(output.fixtureProjectId).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.pfoBookSelectRe = output.pfoBookName.length > 0 ? ('^Select all chapters in ' + String(output.pfoBookName).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.assignedCountLabelRe = '^Assigned chapters \\([0-9]+\\)$';
} else if (phase === "before") {
output.pfoCountBefore = (maestro.copiedText === undefined || maestro.copiedText === null) ? '' : String(maestro.copiedText);
output.pfoCountBeforeRe = '^' + String(output.pfoCountBefore).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$';
} else if (phase === "first") {
output.pfoCountAfterFirst = (maestro.copiedText === undefined || maestro.copiedText === null) ? '' : String(maestro.copiedText);
output.pfoCountAfterFirstRe = '^' + String(output.pfoCountAfterFirst).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$';
} else if (phase === "second") {
output.pfoCountAfterSecond = (maestro.copiedText === undefined || maestro.copiedText === null) ? '' : String(maestro.copiedText);
} else { throw new Error("Unknown PFO selector phase"); }
