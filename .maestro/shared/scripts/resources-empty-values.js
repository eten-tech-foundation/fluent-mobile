// Resources empty fixture values: plain Maestro runScript. No I/O.
output.emptyFixture = (typeof MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE === 'undefined' || MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE === null) ? '' : String(MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE);
output.emptyKind = (typeof MAESTRO_EXPECT_RESOURCES_EMPTY_KIND === 'undefined' || MAESTRO_EXPECT_RESOURCES_EMPTY_KIND === null) ? '' : String(MAESTRO_EXPECT_RESOURCES_EMPTY_KIND);
output.emptyMessage = output.emptyKind === 'device_inventory' ? 'No resources are on this device yet. Download them from Prepare for Offline.' : (output.emptyKind === 'none_for_verse' ? 'No resources available for this verse' : '');
output.emptyMessageRe = output.emptyMessage.length > 0 ? ('^' + String(output.emptyMessage).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$') : '';
