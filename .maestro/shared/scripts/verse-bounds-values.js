// Fixture-specific values exported as primitives for Maestro runScript. No I/O.
output.fixtureChapterId = (typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined' || MAESTRO_FIXTURE_CHAPTER_ID === null) ? '' : String(MAESTRO_FIXTURE_CHAPTER_ID).trim();
output.verseRefFirst = (typeof MAESTRO_FIXTURE_VERSE_REF_FIRST === 'undefined' || MAESTRO_FIXTURE_VERSE_REF_FIRST === null) ? '' : String(MAESTRO_FIXTURE_VERSE_REF_FIRST);
output.verseRefNext = (typeof MAESTRO_FIXTURE_VERSE_REF_NEXT === 'undefined' || MAESTRO_FIXTURE_VERSE_REF_NEXT === null) ? '' : String(MAESTRO_FIXTURE_VERSE_REF_NEXT);
output.verseRefFirstRe = output.verseRefFirst.length > 0 ? ('^' + String(output.verseRefFirst).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.verseRefNextRe = output.verseRefNext.length > 0 ? ('^' + String(output.verseRefNext).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.myWorkRowIdRe = output.fixtureChapterId.length > 0 ? ('^my-work-row-' + String(output.fixtureChapterId).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
