function requireExact(name, value, expected) {
  if (String(value) !== expected) throw new Error('Requires '+name+'='+expected);
}
requireExact('project', MAESTRO_FIXTURE_PROJECT_ID, '12');
requireExact('unit', MAESTRO_FIXTURE_MILESTONE_ID, '19');
requireExact('assignment', MAESTRO_FIXTURE_CHAPTER_ID, '1183');
requireExact('native guard', MAESTRO_INCOMPLETE_NATIVE_VERIFIED, '1');
requireExact('user', MAESTRO_INCOMPLETE_USER_ID, '10');
output.incompleteFixtureReady = true;
