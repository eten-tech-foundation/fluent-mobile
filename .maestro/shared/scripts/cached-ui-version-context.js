// Context is verified independently by root; no auth or KV access in Maestro.
if (
  typeof MAESTRO_CACHED_UI_CONTEXT_VERIFIED === 'undefined' ||
  String(MAESTRO_CACHED_UI_CONTEXT_VERIFIED) !== '1'
)
  throw new Error(
    'Requires active12/Home, saved10/9/12, six takes preserved, no capture',
  );
if (
  typeof MAESTRO_CACHED_UI_INITIAL_LEGACY_VERIFIED === 'undefined' ||
  String(MAESTRO_CACHED_UI_INITIAL_LEGACY_VERIFIED) !== '1'
)
  throw new Error(
    'Requires root verification initial native absent/default Legacy or explicit Legacy',
  );
var gallery =
  typeof MAESTRO_CACHED_UI_GALLERY_EXPECTATION === 'undefined'
    ? 'unverified'
    : String(MAESTRO_CACHED_UI_GALLERY_EXPECTATION);
if (['present', 'absent', 'unverified'].indexOf(gallery) < 0)
  throw new Error(
    'Gallery expectation must be independently verified present/absent or unverified',
  );
output.cachedUiGalleryExpectation = gallery;
