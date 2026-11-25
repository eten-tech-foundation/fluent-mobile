// Fixture chapter selectors — Maestro runScript (plain JS).
// Installed engine (2.10.0): complex concat/regex via inline evalScript leaves
// output.* undefined; function declarations in runScript also drop output.*.
// Keep top-level output assignments only. Reads already-normalized
// output.fixtureChapterId; ordinary regex escaping.

output.myWorkRowIdRe =
  (output.fixtureChapterId === undefined || output.fixtureChapterId === null || String(output.fixtureChapterId).trim().length === 0)
    ? ''
    : ('^my-work-row-' + String(output.fixtureChapterId).trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$');

output.homeNextIdRe =
  (output.fixtureChapterId === undefined || output.fixtureChapterId === null || String(output.fixtureChapterId).trim().length === 0)
    ? ''
    : ('^home-next-' + String(output.fixtureChapterId).trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + ':');

output.homeChangesIdRe =
  (output.fixtureChapterId === undefined || output.fixtureChapterId === null || String(output.fixtureChapterId).trim().length === 0)
    ? ''
    : ('^home-changes-requested-' + String(output.fixtureChapterId).trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$');

output.bookChapterIdRe =
  (output.fixtureChapterId === undefined || output.fixtureChapterId === null || String(output.fixtureChapterId).trim().length === 0)
    ? ''
    : ('^book-chapter-' + String(output.fixtureChapterId).trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$');

output.bookPassageIdRe =
  (output.fixtureChapterId === undefined || output.fixtureChapterId === null || String(output.fixtureChapterId).trim().length === 0)
    ? ''
    : ('^book-passage-' + String(output.fixtureChapterId).trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '-');
