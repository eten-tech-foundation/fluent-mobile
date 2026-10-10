/**
 * Component gallery (Next UI review screen). On in development, preview and
 * nightly builds via eas.json; never set for production.
 */
export function isComponentGalleryEnabled(): boolean {
  return process.env.EXPO_PUBLIC_COMPONENT_GALLERY?.trim() === 'true';
}
