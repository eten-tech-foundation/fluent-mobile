// D-0188-03: centered empty Resources geometry on EXISTING fixture484.
// Read-only. Assertion-only values for Maestro runScript (Graal-safe).
// Does not re-prove copy-only empty Resources PASS; geometry + online-empty
// precondition contract only. No I/O.
function required(name, value, expected) {
  if (String(value) !== expected)
    throw new Error('Requires ' + name + '=' + expected);
}
function requiredOne(name, value) {
  if (value === undefined || value === null || String(value).trim() === '')
    throw new Error('Requires non-empty ' + name);
  return String(value).trim();
}

required(
  'fixture',
  typeof MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE === 'undefined'
    ? ''
    : MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE,
  '484',
);
required(
  'kind',
  typeof MAESTRO_EXPECT_RESOURCES_EMPTY_KIND === 'undefined'
    ? ''
    : MAESTRO_EXPECT_RESOURCES_EMPTY_KIND,
  'none_for_verse',
);
required(
  'user',
  typeof MAESTRO_D0188_USER_ID === 'undefined' ? '' : MAESTRO_D0188_USER_ID,
  '10',
);
required(
  'cached',
  typeof MAESTRO_D0188_CACHED_IDS === 'undefined'
    ? ''
    : MAESTRO_D0188_CACHED_IDS,
  '10,9,12',
);
required(
  'serial',
  typeof MAESTRO_D0188_SERIAL === 'undefined' ? '' : MAESTRO_D0188_SERIAL,
  'emulator-5554',
);
required(
  'geometry attestation',
  typeof MAESTRO_D0188_GEOMETRY_ATTESTATION === 'undefined'
    ? ''
    : MAESTRO_D0188_GEOMETRY_ATTESTATION,
  '1',
);
required(
  'online-empty precondition',
  typeof MAESTRO_D0188_ONLINE_EMPTY_PRECONDITION_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_D0188_ONLINE_EMPTY_PRECONDITION_VERIFIED,
  '1',
);
required(
  'airplane-off',
  typeof MAESTRO_D0188_AIRPLANE_OFF_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_D0188_AIRPLANE_OFF_VERIFIED,
  '1',
);

var emptyMessage = 'No resources available for this verse';
output.emptyFixture = '484';
output.emptyKind = 'none_for_verse';
output.emptyMessage = emptyMessage;
output.emptyMessageRe =
  '^' + emptyMessage.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '$';
output.emptyHostId = 'resources-tab';
output.emptyMessageId = 'resources-tab-empty-message';
output.myWorkRowId = 'my-work-row-484';
output.geometryMaxDeltaCenterXFrac = requiredOne(
  'max dx',
  typeof MAESTRO_D0188_MAX_DELTA_CENTER_X_FRAC === 'undefined'
    ? '0.08'
    : MAESTRO_D0188_MAX_DELTA_CENTER_X_FRAC,
);
output.geometryMaxDeltaCenterYFrac = requiredOne(
  'max dy',
  typeof MAESTRO_D0188_MAX_DELTA_CENTER_Y_FRAC === 'undefined'
    ? '0.08'
    : MAESTRO_D0188_MAX_DELTA_CENTER_Y_FRAC,
);
output.d0188GeometryReady = '1';
output.restoreActiveUserId = '12';
