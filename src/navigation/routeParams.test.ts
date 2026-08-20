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
  it('parses search-param helpers', () => {
    expect(parseOptionalBoolean('true')).toBe(true);
    expect(parseOptionalBoolean('0')).toBe(false);
    expect(parseOptionalBoolean(undefined)).toBeUndefined();
    expect(parseRequiredNumber('42', 'projectId')).toBe(42);
    expect(() => parseRequiredNumber(undefined, 'projectId')).toThrow(
      /projectId/,
    );
    expect(parseOptionalNumber('3')).toBe(3);
    expect(parseOptionalString('')).toBeUndefined();
    expect(parseRequiredString('Mark', 'chapterName')).toBe('Mark');
    expect(boolParam(true)).toBe('true');
    expect(boolParam(undefined)).toBeUndefined();
  });
});

describe('hrefs', () => {
  it('builds typed destinations used by navigation', () => {
    expect(hrefs.login).toBe('/(auth)/login');
    expect(hrefs.settings).toBe('/(app)/settings');
    expect(hrefs.home({ newUserLoading: true })).toEqual({
      pathname: '/(app)/(stack)',
      params: { newUserLoading: 'true' },
    });
    expect(
      hrefs.chapters({ projectId: 9, projectName: 'Mark', language: 'en' }),
    ).toEqual({
      pathname: '/(app)/(stack)/chapters',
      params: { projectId: '9', projectName: 'Mark', language: 'en' },
    });
  });
});
