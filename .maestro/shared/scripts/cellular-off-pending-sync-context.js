// Android default-network observation plus exact app waiting_wifi hint; no direct JS NetInfo read.
if (
  typeof MAESTRO_CELLULAR_OFF_PENDING_SYNC_VERIFIED === 'undefined' ||
  String(MAESTRO_CELLULAR_OFF_PENDING_SYNC_VERIFIED) !== '1'
) {
  throw new Error(
    'Requires active10/prepared Sync/cache10,9,12; six takes/two known pending unchanged; no active transfer; AndroidWiFi0/mobiledata1 AND native default MOBILE CONNECTED/CELLULAR/VALIDATED/INTERNET with exact app waiting_wifi hint; no direct JS NetInfo read; cellular preferenceOFF; root finally restores original WiFi1 and active12',
  );
}
