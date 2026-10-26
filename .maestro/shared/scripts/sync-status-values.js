// Sync status fixture values: plain Maestro runScript. No I/O.
output.expectStatusTitle = (typeof MAESTRO_EXPECT_SYNC_STATUS_TITLE === 'undefined' || MAESTRO_EXPECT_SYNC_STATUS_TITLE === null) ? '' : String(MAESTRO_EXPECT_SYNC_STATUS_TITLE);
output.expectControls = (typeof MAESTRO_EXPECT_SYNC_CONTROLS === 'undefined' || MAESTRO_EXPECT_SYNC_CONTROLS === null) ? '' : String(MAESTRO_EXPECT_SYNC_CONTROLS);
output.expectCountText = (typeof MAESTRO_EXPECT_UPLOAD_CHAPTER_COUNT_TEXT === 'undefined' || MAESTRO_EXPECT_UPLOAD_CHAPTER_COUNT_TEXT === null) ? '' : String(MAESTRO_EXPECT_UPLOAD_CHAPTER_COUNT_TEXT);
output.expectSyncError = (typeof MAESTRO_EXPECT_SYNC_ERROR === 'undefined' || MAESTRO_EXPECT_SYNC_ERROR === null || String(MAESTRO_EXPECT_SYNC_ERROR) === '') ? 'none' : String(MAESTRO_EXPECT_SYNC_ERROR);
output.expectDownloads = (typeof MAESTRO_EXPECT_DOWNLOADS === 'undefined' || MAESTRO_EXPECT_DOWNLOADS === null || String(MAESTRO_EXPECT_DOWNLOADS) === '') ? 'absent' : String(MAESTRO_EXPECT_DOWNLOADS);
output.statusTitleRe = output.expectStatusTitle.length > 0 ? ('^' + String(output.expectStatusTitle).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.countTextRe = output.expectCountText.length > 0 ? ('^' + String(output.expectCountText).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
