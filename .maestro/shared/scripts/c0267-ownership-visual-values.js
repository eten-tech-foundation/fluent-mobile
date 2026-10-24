// C-0267-01 visual: Legacy primary vs muted ownership icons on project12 list.
// Assertion-only. Protected takes/roles not mutated. Issue #267 colors:
// mine primary #0B50D0; other mutedForeground (Legacy hsl 0 0% 33% → #545454).
function required(name, value, expected) {
  if (String(value) !== expected)
    throw new Error('Requires ' + name + '=' + expected);
}
required(
  'project',
  typeof MAESTRO_C0267_PROJECT_ID === 'undefined'
    ? ''
    : MAESTRO_C0267_PROJECT_ID,
  '12',
);
required(
  'fixture project',
  typeof MAESTRO_FIXTURE_PROJECT_ID === 'undefined'
    ? ''
    : MAESTRO_FIXTURE_PROJECT_ID,
  '12',
);
required(
  'milestone',
  typeof MAESTRO_C0267_MILESTONE_ID === 'undefined'
    ? ''
    : MAESTRO_C0267_MILESTONE_ID,
  '19',
);
required(
  'fixture milestone',
  typeof MAESTRO_FIXTURE_MILESTONE_ID === 'undefined'
    ? ''
    : MAESTRO_FIXTURE_MILESTONE_ID,
  '19',
);
required(
  'mine assignment',
  typeof MAESTRO_C0267_MINE_ASSIGNMENT_ID === 'undefined'
    ? ''
    : MAESTRO_C0267_MINE_ASSIGNMENT_ID,
  '1185',
);
required(
  'other assignment',
  typeof MAESTRO_C0267_OTHER_ASSIGNMENT_ID === 'undefined'
    ? ''
    : MAESTRO_C0267_OTHER_ASSIGNMENT_ID,
  '1184',
);
required(
  'user',
  typeof MAESTRO_C0267_USER_ID === 'undefined' ? '' : MAESTRO_C0267_USER_ID,
  '10',
);
required(
  'cached',
  typeof MAESTRO_C0267_CACHED_IDS === 'undefined'
    ? ''
    : MAESTRO_C0267_CACHED_IDS,
  '10,9,12',
);
required(
  'serial',
  typeof MAESTRO_C0267_SERIAL === 'undefined' ? '' : MAESTRO_C0267_SERIAL,
  'emulator-5554',
);
required(
  'context',
  typeof MAESTRO_C0267_VISUAL_ATTESTATION === 'undefined'
    ? ''
    : MAESTRO_C0267_VISUAL_ATTESTATION,
  'p12-m19-1185mine-1184other-legacy-primary-muted',
);

output.mineRowIdRe = '^chapter-row-1185$';
output.otherRowIdRe = '^chapter-row-1184$';
output.mineLabelRe = '^1 Peter 3$';
output.otherLabelRe = '^1 Peter 2$';
output.milestoneRowIdRe = '^milestone-row-19$';
output.legacyPrimaryHex = '#0B50D0';
output.legacyMutedHex = '#545454';
output.cardSurfaceHex = '#EAEEF5';
output.c0267VisualReady = '1';
