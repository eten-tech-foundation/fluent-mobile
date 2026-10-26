// Ownership status fixture values: plain Maestro runScript. No I/O.
output.expectOwnership = (typeof MAESTRO_EXPECT_OWNERSHIP === 'undefined' || MAESTRO_EXPECT_OWNERSHIP === null) ? '' : String(MAESTRO_EXPECT_OWNERSHIP);
output.expectRecordWarning = (typeof MAESTRO_EXPECT_RECORD_WARNING === 'undefined' || MAESTRO_EXPECT_RECORD_WARNING === null || String(MAESTRO_EXPECT_RECORD_WARNING) === '') ? 'none' : String(MAESTRO_EXPECT_RECORD_WARNING);
output.fixtureProjectName = (typeof MAESTRO_FIXTURE_PROJECT_NAME === 'undefined' || MAESTRO_FIXTURE_PROJECT_NAME === null) ? '' : String(MAESTRO_FIXTURE_PROJECT_NAME);
output.fixtureChapterLabel = (typeof MAESTRO_FIXTURE_CHAPTER_LABEL === 'undefined' || MAESTRO_FIXTURE_CHAPTER_LABEL === null) ? '' : String(MAESTRO_FIXTURE_CHAPTER_LABEL);
output.projectNameRe = output.fixtureProjectName.length > 0 ? ('^' + String(output.fixtureProjectName).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.chapterLabelRe = output.fixtureChapterLabel.length > 0 ? ('^' + String(output.fixtureChapterLabel).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
