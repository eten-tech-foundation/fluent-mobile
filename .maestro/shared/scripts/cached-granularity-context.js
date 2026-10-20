// Root independently verifies fixture; phase controls whether setup is allowed.
if (
  typeof MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED === 'undefined' ||
  String(MAESTRO_CACHED_UNIT_CONTEXT_VERIFIED) !== '1'
)
  throw new Error(
    'Verify project12/assignment1183/user10/cache10,9,12; no capture',
  );
output.cachedUnitFixture = '12:1183:10:1:178:60';

var phase =
  typeof MAESTRO_CACHED_UNIT_PHASE === 'undefined'
    ? ''
    : String(MAESTRO_CACHED_UNIT_PHASE);
if (['full', 'prepared-content', 'prepared-record-source'].indexOf(phase) < 0)
  throw new Error('Explicit full or prepared-content phase required');
if (
  phase !== 'full' &&
  (typeof MAESTRO_CACHED_UNIT_PREPARED_PERICOPE_VERIFIED === 'undefined' ||
    String(MAESTRO_CACHED_UNIT_PREPARED_PERICOPE_VERIFIED) !== '1')
)
  throw new Error(
    'Independently verify Pericope preference and expanded first Bible card',
  );
output.cachedUnitPhase = phase;
