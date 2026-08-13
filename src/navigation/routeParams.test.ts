import {
  boolParam,
  parseOptionalBoolean,
  parseOptionalNumber,
  parseOptionalString,
  parseRequiredNumber,
  parseRequiredString,
} from './routeParams';
import { hrefs } from './hrefs';

describe('routeParams', () => {
  it('parses optional booleans from string search params', () => {
    expect(parseOptionalBoolean('true')).toBe(true);
    expect(parseOptionalBoolean('1')).toBe(true);
    expect(parseOptionalBoolean('false')).toBe(false);
    expect(parseOptionalBoolean('0')).toBe(false);
    expect(parseOptionalBoolean(undefined)).toBeUndefined();
    expect(parseOptionalBoolean(['true'])).toBe(true);
  });

  it('parses required numbers and throws when missing', () => {
    expect(parseRequiredNumber('42', 'projectId')).toBe(42);
    expect(parseRequiredNumber(['7'], 'projectId')).toBe(7);
    expect(() => parseRequiredNumber(undefined, 'projectId')).toThrow(
      /projectId/,
    );
    expect(() => parseRequiredNumber('nope', 'projectId')).toThrow(/projectId/);
  });

  it('parses optional number / string helpers', () => {
    expect(parseOptionalNumber('3')).toBe(3);
    expect(parseOptionalNumber(undefined)).toBeUndefined();
    expect(parseOptionalString('abc')).toBe('abc');
    expect(parseOptionalString('')).toBeUndefined();
    expect(parseRequiredString('Mark', 'chapterName')).toBe('Mark');
    expect(() => parseRequiredString(undefined, 'chapterName')).toThrow(
      /chapterName/,
    );
  });

  it('serializes boolean query params', () => {
    expect(boolParam(true)).toBe('true');
    expect(boolParam(false)).toBe('false');
    expect(boolParam(undefined)).toBeUndefined();
  });
});

describe('hrefs', () => {
  it('builds home href with optional newUserLoading', () => {
    expect(hrefs.home()).toEqual({
      pathname: '/(app)/(stack)',
      params: undefined,
    });
    expect(hrefs.home({ newUserLoading: true })).toEqual({
      pathname: '/(app)/(stack)',
      params: { newUserLoading: 'true' },
    });
  });

  it('builds chapters and verse-detail hrefs with stringified ids', () => {
    expect(
      hrefs.chapters({
        projectId: 9,
        projectName: 'Mark',
        language: 'en',
      }),
    ).toEqual({
      pathname: '/(app)/(stack)/chapters',
      params: {
        projectId: '9',
        projectName: 'Mark',
        language: 'en',
      },
    });

    expect(
      hrefs.verseDetail({
        chapterId: 14,
        chapterName: 'Mark 14',
        projectName: 'Mark',
        language: 'en',
      }),
    ).toEqual({
      pathname: '/(app)/(stack)/verse-detail',
      params: {
        chapterId: '14',
        chapterName: 'Mark 14',
        projectName: 'Mark',
        language: 'en',
      },
    });
  });

  it('builds prepare-for-offline with optional projectId', () => {
    expect(hrefs.prepareForOffline()).toEqual({
      pathname: '/(app)/(stack)/prepare-for-offline',
      params: undefined,
    });
    expect(hrefs.prepareForOffline({ projectId: 3 })).toEqual({
      pathname: '/(app)/(stack)/prepare-for-offline',
      params: { projectId: '3' },
    });
  });

  it('exposes static auth and app destinations', () => {
    expect(hrefs.login).toBe('/(auth)/login');
    expect(hrefs.settings).toBe('/(app)/(stack)/settings');
    expect(hrefs.sync).toBe('/(app)/(stack)/sync');
    expect(hrefs.addUser).toBe('/(app)/(stack)/add-user');
  });
});
