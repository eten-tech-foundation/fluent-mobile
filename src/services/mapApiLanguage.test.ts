import { mapApiLanguage } from './mapApiLanguage';

describe('mapApiLanguage', () => {
  it('prefers langCodeIso6393 from the fluent-api OpenAPI shape', () => {
    expect(
      mapApiLanguage({
        id: 1,
        langName: 'English',
        langCodeIso6393: 'eng',
        langCode: 'xx',
      }),
    ).toMatchObject({ id: 1, langName: 'English', langCode: 'eng' });
  });

  it('falls back to legacy langCode when iso field is absent', () => {
    expect(
      mapApiLanguage({
        id: 2,
        langName: 'Spanish',
        langCode: 'spa',
      }),
    ).toMatchObject({ langCode: 'spa' });
  });
});
