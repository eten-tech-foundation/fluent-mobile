// Fixture-specific values exported as primitives for Maestro runScript. No I/O.
output.populatedFixture = (typeof MAESTRO_EXPECT_RESOURCES_POPULATED_FIXTURE === 'undefined' || MAESTRO_EXPECT_RESOURCES_POPULATED_FIXTURE === null) ? '' : String(MAESTRO_EXPECT_RESOURCES_POPULATED_FIXTURE).trim();
output.sectionEnum = (typeof MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION === 'undefined' || MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION === null) ? '' : String(MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION).trim();
output.contentMarker = (typeof MAESTRO_EXPECT_RESOURCES_CONTENT_MARKER === 'undefined' || MAESTRO_EXPECT_RESOURCES_CONTENT_MARKER === null) ? '' : String(MAESTRO_EXPECT_RESOURCES_CONTENT_MARKER);
output.sectionId = output.sectionEnum == 'translation_notes' ? 'translationNotes' : (output.sectionEnum == 'translation_questions' ? 'translationQuestions' : (output.sectionEnum == 'images_maps' ? 'imagesMaps' : ''));
output.sectionToggleId = output.sectionId.length > 0 ? ('resources-section-' + output.sectionId + '-toggle') : '';
output.sectionHostId = output.sectionId.length > 0 ? ('resources-section-' + output.sectionId) : '';
output.contentMarkerRe = output.contentMarker.length > 0 ? ('^' + String(output.contentMarker).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
output.myWorkRowIdRe = output.populatedFixture.length > 0 ? ('^my-work-row-' + String(output.populatedFixture).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
