import { isComponentGalleryEnabled } from './componentGallery';

describe('isComponentGalleryEnabled', () => {
  const original = process.env.EXPO_PUBLIC_COMPONENT_GALLERY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_COMPONENT_GALLERY;
    } else {
      process.env.EXPO_PUBLIC_COMPONENT_GALLERY = original;
    }
  });

  it('is false when the flag is unset', () => {
    delete process.env.EXPO_PUBLIC_COMPONENT_GALLERY;
    expect(isComponentGalleryEnabled()).toBe(false);
  });

  it('is false for values other than "true"', () => {
    process.env.EXPO_PUBLIC_COMPONENT_GALLERY = '1';
    expect(isComponentGalleryEnabled()).toBe(false);
  });

  it('is true when the flag is "true"', () => {
    process.env.EXPO_PUBLIC_COMPONENT_GALLERY = 'true';
    expect(isComponentGalleryEnabled()).toBe(true);
  });
});
