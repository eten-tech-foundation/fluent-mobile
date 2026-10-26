// Fixture-specific values exported as primitives for Maestro runScript. No I/O.
output.fixtureChapterId = (typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined' || MAESTRO_FIXTURE_CHAPTER_ID === null) ? '' : String(MAESTRO_FIXTURE_CHAPTER_ID).trim();
output.takeViewAllMarker = (typeof MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER === 'undefined' || MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER === null) ? '' : String(MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER);
output.takeViewAllMarkerRe = output.takeViewAllMarker.length > 0 ? ('^' + String(output.takeViewAllMarker).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.myWorkRowIdRe = output.fixtureChapterId.length > 0 ? ('^my-work-row-' + String(output.fixtureChapterId).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
