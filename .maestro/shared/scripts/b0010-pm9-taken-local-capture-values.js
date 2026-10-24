// B-0010-01 local-only: PM user9 neither-assignee on 1185 (drafter10/peer11).
// HostmicOFF attested externally. No upload success gate. Graal-safe, no I/O.
function required(name, value, expected) {
  if (String(value) !== expected)
    throw new Error('Requires ' + name + '=' + expected);
}
required(
  'project',
  typeof MAESTRO_B0010_PROJECT_ID === 'undefined' ? '' : MAESTRO_B0010_PROJECT_ID,
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
  typeof MAESTRO_B0010_MILESTONE_ID === 'undefined'
    ? ''
    : MAESTRO_B0010_MILESTONE_ID,
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
  'assignment',
  typeof MAESTRO_B0010_ASSIGNMENT_ID === 'undefined'
    ? ''
    : MAESTRO_B0010_ASSIGNMENT_ID,
  '1185',
);
required(
  'fixture chapter',
  typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined'
    ? ''
    : MAESTRO_FIXTURE_CHAPTER_ID,
  '1185',
);
required(
  'user',
  typeof MAESTRO_B0010_USER_ID === 'undefined' ? '' : MAESTRO_B0010_USER_ID,
  '9',
);
required(
  'cached',
  typeof MAESTRO_B0010_CACHED_IDS === 'undefined'
    ? ''
    : MAESTRO_B0010_CACHED_IDS,
  '10,9,12',
);
required(
  'serial',
  typeof MAESTRO_B0010_SERIAL === 'undefined' ? '' : MAESTRO_B0010_SERIAL,
  'emulator-5554',
);
required(
  'host mic',
  typeof MAESTRO_HOST_MIC_DISABLED_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_HOST_MIC_DISABLED_VERIFIED,
  '1',
);
required(
  'verse',
  typeof MAESTRO_B0010_VERSE === 'undefined' ? '' : MAESTRO_B0010_VERSE,
  '1',
);
required(
  'empty verse',
  typeof MAESTRO_B0010_EMPTY_VERSE_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_B0010_EMPTY_VERSE_VERIFIED,
  '1',
);
required(
  'admission',
  typeof MAESTRO_B0010_ADMISSION === 'undefined' ? '' : MAESTRO_B0010_ADMISSION,
  'ADMITTED',
);
// Refuse protected mutation targets
if (String(MAESTRO_B0010_ASSIGNMENT_ID) === '1183')
  throw new Error('1183 protected');
if (String(MAESTRO_B0010_ASSIGNMENT_ID) === '1184')
  throw new Error('1184 protected');
if (String(MAESTRO_B0010_ASSIGNMENT_ID) === '944')
  throw new Error('944 denylist');

output.b0010Ready = '1';
output.milestoneRowIdRe = '^milestone-row-19$';
output.chapterRowIdRe = '^chapter-row-1185$';
output.chapterLabelRe = '^1 Peter 3$';
output.verseRowIdRe = '^bible-verse-row-1$';
output.referenceRe = '^1 Peter 3:1$';
output.takenWarningRe =
  '^This chapter is assigned to another translator\\.$';
output.takeRowRe = '^record-take-row-rec_[a-z0-9]+_[a-z0-9]+$';
output.takeSyncRe = '^record-take-sync-rec_[a-z0-9]+_[a-z0-9]+$';
output.restoreActiveUserId = '12';
