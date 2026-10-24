// B-0011-01: chapter-list assignment/stage refresh oracle (assertion-only).
// Mobile YAML never mutates web/stage/roles. Protected 1183/1184 always refused.
// Admission is external: NOT_ADMITTED until exact id/roles/stage/zero-takes verified.
function required(name, value, expected) {
  if (String(value) !== expected)
    throw new Error('Requires ' + name + '=' + expected);
}
required(
  'project',
  typeof MAESTRO_B0011_PROJECT_ID === 'undefined'
    ? ''
    : MAESTRO_B0011_PROJECT_ID,
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
  typeof MAESTRO_B0011_MILESTONE_ID === 'undefined'
    ? ''
    : MAESTRO_B0011_MILESTONE_ID,
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
  'user',
  typeof MAESTRO_B0011_USER_ID === 'undefined' ? '' : MAESTRO_B0011_USER_ID,
  '10',
);
required(
  'cached',
  typeof MAESTRO_B0011_CACHED_IDS === 'undefined'
    ? ''
    : MAESTRO_B0011_CACHED_IDS,
  '10,9,12',
);
required(
  'serial',
  typeof MAESTRO_B0011_SERIAL === 'undefined' ? '' : MAESTRO_B0011_SERIAL,
  'emulator-5554',
);
required(
  'ownership preflight',
  typeof MAESTRO_B0011_OWNERSHIP_PREFLIGHT_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_B0011_OWNERSHIP_PREFLIGHT_VERIFIED,
  '1',
);
required(
  'empty recordings',
  typeof MAESTRO_B0011_EMPTY_RECORDINGS_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_B0011_EMPTY_RECORDINGS_VERIFIED,
  '1',
);
required(
  'live mutation hold',
  typeof MAESTRO_B0011_LIVE_MUTATION_HOLD === 'undefined'
    ? ''
    : MAESTRO_B0011_LIVE_MUTATION_HOLD,
  'approved-at-execution',
);

var assignment =
  typeof MAESTRO_B0011_ASSIGNMENT_ID === 'undefined'
    ? ''
    : String(MAESTRO_B0011_ASSIGNMENT_ID).trim();
var fixtureChapter =
  typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined'
    ? ''
    : String(MAESTRO_FIXTURE_CHAPTER_ID).trim();
if (!/^[1-9][0-9]*$/.test(assignment))
  throw new Error('Requires positive MAESTRO_B0011_ASSIGNMENT_ID');
if (assignment !== fixtureChapter)
  throw new Error(
    'Requires MAESTRO_FIXTURE_CHAPTER_ID to equal MAESTRO_B0011_ASSIGNMENT_ID',
  );
if (assignment === '1183' || assignment === '1184' || assignment === '944')
  throw new Error(
    'Protected/denylisted assignment ' +
      assignment +
      ' is forbidden for B-0011',
  );

var admission =
  typeof MAESTRO_B0011_ADMISSION === 'undefined'
    ? ''
    : String(MAESTRO_B0011_ADMISSION).trim();
if (admission !== 'ADMITTED')
  throw new Error(
    'NOT_ADMITTED: set MAESTRO_B0011_ADMISSION=ADMITTED only after exact id/roles/stage/zero-takes + web controls verified (retained inventory candidate chapter3 id 1185 is not live admission)',
  );

var phase =
  typeof MAESTRO_B0011_PHASE === 'undefined'
    ? ''
    : String(MAESTRO_B0011_PHASE).trim();
if (phase !== 'before' && phase !== 'after')
  throw new Error('Requires MAESTRO_B0011_PHASE=before|after');

var ownership =
  typeof MAESTRO_B0011_EXPECT_OWNERSHIP === 'undefined'
    ? ''
    : String(MAESTRO_B0011_EXPECT_OWNERSHIP).trim();
if (['mine', 'other', 'unassigned', 'conflict'].indexOf(ownership) < 0)
  throw new Error(
    'Requires MAESTRO_B0011_EXPECT_OWNERSHIP=mine|other|unassigned|conflict',
  );

var stageLabel =
  typeof MAESTRO_B0011_EXPECT_STAGE_LABEL === 'undefined'
    ? ''
    : String(MAESTRO_B0011_EXPECT_STAGE_LABEL).trim();
var allowedStages = [
  'Not Started',
  'Draft',
  'Peer Check',
  'Community Check',
  'Advanced Check',
  'Complete',
];
if (allowedStages.indexOf(stageLabel) < 0)
  throw new Error(
    'Requires MAESTRO_B0011_EXPECT_STAGE_LABEL one of source WorkflowBadge labels',
  );

var chapterLabel =
  typeof MAESTRO_B0011_CHAPTER_LABEL === 'undefined'
    ? ''
    : String(MAESTRO_B0011_CHAPTER_LABEL).trim();
if (!chapterLabel)
  throw new Error('Requires non-empty MAESTRO_B0011_CHAPTER_LABEL');

var webReceipt =
  typeof MAESTRO_B0011_WEB_RECEIPT_ID === 'undefined'
    ? ''
    : String(MAESTRO_B0011_WEB_RECEIPT_ID).trim();
if (!webReceipt)
  throw new Error(
    'Requires MAESTRO_B0011_WEB_RECEIPT_ID pairing this mobile phase to an external web receipt (YAML state does not survive)',
  );

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

output.b0011Phase = phase;
output.b0011AssignmentId = assignment;
output.expectOwnership = ownership;
output.chapterLabelRe = '^' + escapeRe(chapterLabel) + '$';
output.stageLabelRe = '^' + escapeRe(stageLabel) + '$';
output.chapterRowIdRe = '^chapter-row-' + assignment + '$';
output.milestoneRowIdRe = '^milestone-row-19$';
output.webReceiptId = webReceipt;
output.b0011Admitted = '1';
