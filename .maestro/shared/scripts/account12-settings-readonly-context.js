// Native preflight stays outside this UI observer. No auth/storage actions.
if (
  typeof MAESTRO_ACCOUNT12_SETTINGS_CONTEXT_VERIFIED === 'undefined' ||
  String(MAESTRO_ACCOUNT12_SETTINGS_CONTEXT_VERIFIED) !== '1'
) {
  throw new Error(
    'Requires active12/Home/cache10,9,12; cellular preference OFF; no capture/recovery or active transfer; no Settings mutation authorized',
  );
}
var prefs =
  typeof MAESTRO_ACCOUNT12_SETTINGS_LEGACY_VERSE_VERIFIED === 'undefined'
    ? '0'
    : String(MAESTRO_ACCOUNT12_SETTINGS_LEGACY_VERSE_VERIFIED);
if (['0', '1'].indexOf(prefs) < 0)
  throw new Error('Legacy/Verse preflight attestation must be0or1');
output.account12SettingsVerifyLegacyVerse = prefs === '1';
