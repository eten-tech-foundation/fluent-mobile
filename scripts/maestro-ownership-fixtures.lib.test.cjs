'use strict';

const {
  readConflict,
  readMergedConflict,
  progressConflictByAssignmentId,
  isUsableClaimChapter,
  resetSelectedMissingMessage,
  staleBaseVersionToken,
  interpretResetSelectedHttp,
  minimalWavBytes,
} = require('./maestro-ownership-fixtures.lib.cjs');

describe('maestro-ownership-fixtures.lib', () => {
  describe('readConflict', () => {
    it('reads hasConflict from progress rows', () => {
      expect(readConflict({ hasConflict: true })).toBe(true);
      expect(readConflict({ hasConflict: false })).toBe(false);
    });

    it('does not invent a conflict when the flag is missing', () => {
      expect(readConflict({})).toBe(false);
      expect(readConflict(null)).toBe(false);
    });

    it('prefers progress hasConflict over a list row without the flag', () => {
      expect(readMergedConflict({ hasConflict: true }, {})).toBe(true);
      expect(readMergedConflict({ hasConflict: false }, {})).toBe(false);
    });
  });

  describe('progressConflictByAssignmentId', () => {
    it('indexes GET .../progress rows by assignment id', () => {
      const byId = progressConflictByAssignmentId([
        { assignmentId: 10, hasConflict: true },
        { id: 11, hasConflict: false },
        { chapterAssignmentId: 12, has_conflict: true },
      ]);
      expect(byId.get(10)).toBe(true);
      expect(byId.get(11)).toBe(false);
      expect(byId.get(12)).toBe(true);
    });

    it('returns an empty map for a non-array payload', () => {
      expect(progressConflictByAssignmentId({ data: [] }).size).toBe(0);
    });
  });

  describe('isUsableClaimChapter', () => {
    it('requires unassigned not_started', () => {
      expect(
        isUsableClaimChapter({ assignedUserId: null, status: 'not_started' }),
      ).toBe(true);
      expect(
        isUsableClaimChapter({ assignedUserId: 9, status: 'not_started' }),
      ).toBe(false);
      expect(
        isUsableClaimChapter({ assignedUserId: null, status: 'draft' }),
      ).toBe(false);
    });
  });

  describe('resetSelectedMissingMessage', () => {
    it('names fluent-api #464 and the rotate fallback', () => {
      const msg = resetSelectedMissingMessage(
        'https://dev.api.fluent.bible',
        '/projects/432/chapter-assignments/reset-selected',
      );
      expect(msg).toContain('404');
      expect(msg).toContain('#464');
      expect(msg).toContain('rotate');
    });
  });

  describe('interpretResetSelectedHttp', () => {
    it('treats 2xx as reset', () => {
      expect(interpretResetSelectedHttp(200, []).reset).toBe(true);
    });

    it('treats 404 as rotate fallback', () => {
      const result = interpretResetSelectedHttp(404, { message: 'Not Found' });
      expect(result.reset).toBe(false);
      expect(result.rotate).toBe(true);
      expect(result.reason).toContain('#464');
    });
  });

  describe('staleBaseVersionToken', () => {
    it('reuses the first take token for the conflicting third take', () => {
      expect(staleBaseVersionToken(7)).toBe(7);
      expect(staleBaseVersionToken(undefined)).toBeUndefined();
    });
  });

  describe('minimalWavBytes', () => {
    it('emits distinct PCM for each seed so take hashes differ', () => {
      const a = minimalWavBytes(1);
      const b = minimalWavBytes(2);
      expect(a.length).toBeGreaterThan(44);
      expect(a.equals(b)).toBe(false);
      expect(a.subarray(0, 4).toString()).toBe('RIFF');
    });
  });
});
