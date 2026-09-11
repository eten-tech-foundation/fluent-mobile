import {
  advanceStitchQueue,
  createStitchQueue,
  currentStitchUri,
} from './stitchQueue';

describe('createStitchQueue', () => {
  it('starts at the first uri', () => {
    const queue = createStitchQueue(['file://a.m4a', 'file://b.m4a']);
    expect(queue).toEqual({ uris: ['file://a.m4a', 'file://b.m4a'], index: 0 });
  });

  it('returns null for no input', () => {
    expect(createStitchQueue([])).toBeNull();
  });

  it('drops empty uris and returns null when none remain', () => {
    expect(createStitchQueue(['', ''])).toBeNull();
    expect(createStitchQueue(['', 'file://b.m4a'])).toEqual({
      uris: ['file://b.m4a'],
      index: 0,
    });
  });
});

describe('currentStitchUri', () => {
  it('reads the uri at the current index', () => {
    const queue = createStitchQueue(['file://a.m4a', 'file://b.m4a']);
    expect(currentStitchUri(queue)).toBe('file://a.m4a');
    expect(currentStitchUri(advanceStitchQueue(queue))).toBe('file://b.m4a');
  });

  it('returns null for no queue', () => {
    expect(currentStitchUri(null)).toBeNull();
  });
});

describe('advanceStitchQueue', () => {
  it('walks segments in order', () => {
    let queue = createStitchQueue([
      'file://a.m4a',
      'file://b.m4a',
      'file://c.m4a',
    ]);
    const played: (string | null)[] = [currentStitchUri(queue)];
    while ((queue = advanceStitchQueue(queue))) {
      played.push(currentStitchUri(queue));
    }
    expect(played).toEqual(['file://a.m4a', 'file://b.m4a', 'file://c.m4a']);
  });

  it('returns null after the last segment', () => {
    const queue = createStitchQueue(['file://a.m4a']);
    expect(advanceStitchQueue(queue)).toBeNull();
  });

  it('returns null for no queue', () => {
    expect(advanceStitchQueue(null)).toBeNull();
  });

  it('does not mutate the queue it advances', () => {
    const queue = createStitchQueue(['file://a.m4a', 'file://b.m4a']);
    advanceStitchQueue(queue);
    expect(queue?.index).toBe(0);
  });
});
