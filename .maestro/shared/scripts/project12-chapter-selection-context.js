// Prepared phase only; root owns fresh identity/project/native preflight.
if (
  typeof MAESTRO_PROJECT12_CHAPTER_SELECTION_VERIFIED === 'undefined' ||
  String(MAESTRO_PROJECT12_CHAPTER_SELECTION_VERIFIED) !== '1'
) {
  throw new Error(
    'Requires active10/cache10,9,12; explicit project-row-12 selection; Prepare for Offline project12;1183/ch1 assigned10,1184..1187/ch2..5 unassigned; only chapter1 selected; Assigned chapters(1) and book initially collapsed; no capture/download/upload',
  );
}
