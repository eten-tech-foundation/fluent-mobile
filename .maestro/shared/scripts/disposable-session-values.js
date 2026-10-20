// Root supplies these values only after independently verifying the existing session.
// These guards constrain execution; they do not independently prove DB identity.
var env = {
  project:
    typeof MAESTRO_DISPOSABLE_PROJECT_ID === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_PROJECT_ID),
  assignment:
    typeof MAESTRO_DISPOSABLE_ASSIGNMENT_ID === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_ASSIGNMENT_ID),
  user:
    typeof MAESTRO_DISPOSABLE_USER_ID === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_USER_ID),
  cached:
    typeof MAESTRO_DISPOSABLE_CACHED_IDS === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_CACHED_IDS),
  phase:
    typeof MAESTRO_DISPOSABLE_PHASE === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_PHASE),
  verse:
    typeof MAESTRO_DISPOSABLE_VERSE === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_VERSE),
  take:
    typeof MAESTRO_DISPOSABLE_TAKE_ID === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_TAKE_ID),
  consent:
    typeof MAESTRO_DISPOSABLE_CONTEXT_VERIFIED === 'undefined'
      ? ''
      : String(MAESTRO_DISPOSABLE_CONTEXT_VERIFIED),
};
if (
  env.project !== '12' ||
  env.assignment !== '1183' ||
  env.user !== '10' ||
  env.cached !== '10,9,12' ||
  env.consent !== '1'
)
  throw new Error(
    'Requires independently verified project12/assignment1183/user10/cache10,9,12; non944 only',
  );
if (!/^[1-9][0-9]*$/.test(env.verse) || Number(env.verse) > 25)
  throw new Error('Requires exact 1 Peter1 verse1..25');
var phases = [
  'paused-before-reload',
  'recovery-prompt',
  'paused-after-reload',
  'saved',
  'offline-pending',
  'uploading',
  'uploaded',
];
if (phases.indexOf(env.phase) < 0)
  throw new Error('Unsupported disposable assertion phase');
if (
  ['saved', 'uploaded'].indexOf(env.phase) >= 0 &&
  !/^rec_[a-z0-9]+_[a-z0-9]+$/.test(env.take)
)
  throw new Error('Requires exact saved take ID');
output.disposablePhase = env.phase;
output.disposableReferenceRe = '^1 Peter 1:' + env.verse + '$';
output.disposableTakeSyncRe = '^record-take-sync-' + env.take + '$';
output.disposableScreenshot = 'disposable-1183-' + env.phase;
