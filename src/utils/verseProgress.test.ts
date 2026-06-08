import { offlineDownloadLabel, verseProgressRatio } from './verseProgress';

describe('verseProgress', () => {
  describe('verseProgressRatio', () => {
    it('returns 0 when total is 0', () => {
      expect(verseProgressRatio(3, 0)).toBe(0);
    });

    it('clamps filled to the 0–1 range', () => {
      expect(verseProgressRatio(3, 5)).toBe(0.6);
      expect(verseProgressRatio(10, 5)).toBe(1);
      expect(verseProgressRatio(-1, 5)).toBe(0);
    });
  });

  describe('offlineDownloadLabel', () => {
    it('matches mock accessibility copy', () => {
      expect(offlineDownloadLabel(3, 5)).toBe(
        'Not offline ready, 60% downloaded',
      );
      expect(offlineDownloadLabel(0, 0)).toBe(
        'Not offline ready, 0% downloaded',
      );
    });
  });
});
