// Existing-session Bible-to-Record fixture values; no I/O or capture.
output.fixtureChapterId = (typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined' || MAESTRO_FIXTURE_CHAPTER_ID === null) ? '' : String(MAESTRO_FIXTURE_CHAPTER_ID).trim();
output.fixtureVerseNumber = (typeof MAESTRO_FIXTURE_VERSE_NUMBER === 'undefined' || MAESTRO_FIXTURE_VERSE_NUMBER === null) ? '' : String(MAESTRO_FIXTURE_VERSE_NUMBER).trim();
output.expectRecordReference = (typeof MAESTRO_EXPECT_RECORD_REFERENCE === 'undefined' || MAESTRO_EXPECT_RECORD_REFERENCE === null) ? '' : String(MAESTRO_EXPECT_RECORD_REFERENCE).trim();
output.myWorkRowIdRe = output.fixtureChapterId.length > 0 ? ('^my-work-row-' + String(output.fixtureChapterId).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.bibleVerseRowIdRe = output.fixtureVerseNumber.length > 0 ? ('^bible-verse-row-' + String(output.fixtureVerseNumber).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.recordReferenceRe = output.expectRecordReference.length > 0 ? ('^' + String(output.expectRecordReference).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
