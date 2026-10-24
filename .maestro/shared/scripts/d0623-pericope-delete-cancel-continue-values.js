// D-0623-01 continue: Cancel-only on already-saved pericope 13-16 take (no capture).
function required(name, value, expected) {
  if (String(value) !== expected)
    throw new Error('Requires ' + name + '=' + expected);
}
required(
  'project',
  typeof MAESTRO_D0623_PROJECT_ID === 'undefined'
    ? ''
    : MAESTRO_D0623_PROJECT_ID,
  '12',
);
required(
  'assignment',
  typeof MAESTRO_D0623_ASSIGNMENT_ID === 'undefined'
    ? ''
    : MAESTRO_D0623_ASSIGNMENT_ID,
  '1183',
);
required(
  'fixture chapter',
  typeof MAESTRO_FIXTURE_CHAPTER_ID === 'undefined'
    ? ''
    : MAESTRO_FIXTURE_CHAPTER_ID,
  '1183',
);
required(
  'user',
  typeof MAESTRO_D0623_USER_ID === 'undefined' ? '' : MAESTRO_D0623_USER_ID,
  '10',
);
required(
  'serial',
  typeof MAESTRO_D0623_SERIAL === 'undefined' ? '' : MAESTRO_D0623_SERIAL,
  'emulator-5554',
);
required(
  'existing take',
  typeof MAESTRO_D0623_EXISTING_TAKE_VERIFIED === 'undefined'
    ? ''
    : MAESTRO_D0623_EXISTING_TAKE_VERIFIED,
  '1',
);
required(
  'range attestation',
  typeof MAESTRO_D0623_RANGE_ATTESTATION === 'undefined'
    ? ''
    : MAESTRO_D0623_RANGE_ATTESTATION,
  'fcbh-1peter1-s3-p1-v13-16',
);
output.d0623CardTextRe = '^1 Peter 1:13–16$';
output.d0623RecordReferenceRe = '^1 Peter 1:13–16$';
output.d0623AlertTitleRe = '^Delete pericope take\\?$';
output.d0623AlertBodyRe =
  '^This recording covers vv\\. 13-16\\. Deleting it will remove the whole recording from every verse in that range\\.$';
output.d0623TakeSubtitleRe = 'vv\\. 13-16';
output.d0623TakeRowRe = '^record-take-row-rec_[a-z0-9]+_[a-z0-9]+$';
output.d0623TakeSyncRe = '^record-take-sync-rec_[a-z0-9]+_[a-z0-9]+$';
output.d0623DeleteSelectedRe =
  '^record-delete-selected-button-rec_[a-z0-9]+_[a-z0-9]+$';
output.d0623VerseRowRe = '^bible-verse-row-13$';
