// External attestation only: no auth, storage, sync, or account mutations.
if (
  typeof MAESTRO_ACCOUNT12_EMPTY_QUEUE_VERIFIED === 'undefined' ||
  String(MAESTRO_ACCOUNT12_EMPTY_QUEUE_VERIFIED) !== '1'
) {
  throw new Error(
    'Requires fresh root preflight active12/Home, cached10/9/12, owner12 pending0, known owner10 verse5/6 takes pending, no capture/recovery; Home Sync press90%,50% outside observed Expo FAB bounds',
  );
}
