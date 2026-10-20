// Root owns emulator radio lifecycle/finally restoration and native receipts.
if (
  typeof MAESTRO_OFFLINE_COLD_SESSION_VERIFIED === 'undefined' ||
  String(MAESTRO_OFFLINE_COLD_SESSION_VERIFIED) !== '1'
) {
  throw new Error(
    'Requires active12/Home; cached10/9/12; six takes metadata persisted; no active capture/playback/upload/download; emulator offline; root records original radio state and restores it in finally, then verifies six takes metadata and session',
  );
}
