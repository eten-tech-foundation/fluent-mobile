// Existing-session Bible-to-Record fixture values; no I/O or capture.
output.fixtureChapterId = (typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined' || MAESTRO_FIXTURE_CHAPTER_ID === null) ? '' : String(MAESTRO_FIXTURE_CHAPTER_ID).trim();
output.fixtureVerseNumber = (typeof MAESTRO_FIXTURE_VERSE_NUMBER === 'undefined' || MAESTRO_FIXTURE_VERSE_NUMBER === null) ? '' : String(MAESTRO_FIXTURE_VERSE_NUMBER).trim();
output.expectRecordReference = (typeof MAESTRO_EXPECT_RECORD_REFERENCE === 'undefined' || MAESTRO_EXPECT_RECORD_REFERENCE === null) ? '' : String(MAESTRO_EXPECT_RECORD_REFERENCE).trim();
output.myWorkRowIdRe = '^my-work-row-' + output.fixtureChapterId + '$';
output.bibleVerseRowIdRe = '^bible-verse-row-' + output.fixtureVerseNumber + '$';
output.recordReferenceRe = '^' + output.expectRecordReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
