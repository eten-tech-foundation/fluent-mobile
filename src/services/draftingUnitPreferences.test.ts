import {
  acknowledgeDraftingUnitSync,
  applyRemoteDraftingUnit,
  clearDraftingUnitDirty,
  flushDeferredRemoteApplies,
  getDisplayModeSyncIntent,
  getDraftingUnit,
  getDraftingUnitRevision,
  isDraftingUnitDirty,
  notifyDraftingUnitChanged,
  resetDraftingUnitPreference,
  resetDraftingUnitPreferenceRuntimeForTests,
  setDraftingUnit,
  subscribeToDraftingUnit,
} from './draftingUnitPreference';
import { kvStorage } from './storage';
import {
  resetRecordCaptureGateForTests,
  setRecordCaptureGate,
} from '../navigation/recordCaptureGate';

jest.mock('./storage', () => {
  const store = new Map<string, string>();
  return {
    kvStorage: {
      getItemSync: jest.fn((key: string) => store.get(key) ?? null),
      setItemSync: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItemSync: jest.fn((key: string) => {
        store.delete(key);
      }),
      __store: store,
    },
  };
});

const mockStore = (kvStorage as unknown as { __store: Map<string, string> })
  .__store;

describe('draftingUnitPreference', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    resetRecordCaptureGateForTests();
    resetDraftingUnitPreferenceRuntimeForTests();
  });

  describe('getDraftingUnit', () => {
    it('returns verse by default when nothing is stored', () => {
      expect(getDraftingUnit('user1')).toBe('verse');
    });

    it('returns the stored value for the given user', () => {
      setDraftingUnit('pericope', 'user1');
      expect(getDraftingUnit('user1')).toBe('pericope');
    });

    it('returns default for an empty userId', () => {
      expect(getDraftingUnit('')).toBe('verse');
    });

    it('falls back to default on an unrecognized stored value', () => {
      mockStore.set('user1:drafting_unit', 'not-a-real-unit');
      expect(getDraftingUnit('user1')).toBe('verse');
    });
  });

  describe('setDraftingUnit', () => {
    it('persists the unit, marks dirty, and bumps revision', () => {
      setDraftingUnit('pericope', 'user1');

      expect(getDraftingUnit('user1')).toBe('pericope');
      expect(isDraftingUnitDirty('user1')).toBe(true);
      expect(getDraftingUnitRevision('user1')).toBe(1);
      expect(getDisplayModeSyncIntent('user1')).toBe('pericope');
    });

    it('does nothing for an empty userId', () => {
      setDraftingUnit('pericope', '');
      expect(mockStore.size).toBe(0);
    });

    it('scopes storage per user', () => {
      setDraftingUnit('pericope', 'user1');
      setDraftingUnit('verse', 'user2');

      expect(getDraftingUnit('user1')).toBe('pericope');
      expect(getDraftingUnit('user2')).toBe('verse');
    });
  });

  describe('revision + conditional ACK', () => {
    it('keeps dirty when ACK omits displayMode (legacy strip, no caps)', () => {
      setDraftingUnit('pericope', 'user1');
      const revision = getDraftingUnitRevision('user1');

      const cleared = acknowledgeDraftingUnitSync({
        userId: 'user1',
        capturedUserId: 'user1',
        capturedRevision: revision,
        capturedIntent: 'pericope',
        acknowledgedDisplayMode: undefined,
        acknowledgedDisplayModeKeyPresent: false,
        settingsCapabilitiesSupported: false,
      });

      expect(cleared).toBe(false);
      expect(isDraftingUnitDirty('user1')).toBe(true);
    });

    it('clears dirty only for exact ACK value + revision + user', () => {
      setDraftingUnit('pericope', 'user1');
      const revision = getDraftingUnitRevision('user1');

      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: revision,
          capturedIntent: 'pericope',
          acknowledgedDisplayMode: 'pericope',
          acknowledgedDisplayModeKeyPresent: true,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(true);
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('ACK after newer edit keeps dirty (revision moved)', () => {
      setDraftingUnit('pericope', 'user1');
      const firstRevision = getDraftingUnitRevision('user1');
      setDraftingUnit('verse', 'user1');

      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: firstRevision,
          capturedIntent: 'pericope',
          acknowledgedDisplayMode: 'pericope',
          acknowledgedDisplayModeKeyPresent: true,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(false);
      expect(isDraftingUnitDirty('user1')).toBe(true);
      expect(getDraftingUnit('user1')).toBe('verse');
    });

    it('ABA A→B→A stays dirty until ACK matches latest revision', () => {
      setDraftingUnit('verse', 'user1');
      setDraftingUnit('pericope', 'user1');
      setDraftingUnit('verse', 'user1');
      const latest = getDraftingUnitRevision('user1');

      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: latest - 2,
          capturedIntent: 'verse',
          acknowledgedDisplayMode: 'verse',
          acknowledgedDisplayModeKeyPresent: true,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(false);
      expect(isDraftingUnitDirty('user1')).toBe(true);

      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: latest,
          capturedIntent: 'verse',
          acknowledgedDisplayMode: 'verse',
          acknowledgedDisplayModeKeyPresent: true,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(true);
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('does not clear dirty for a different captured user', () => {
      setDraftingUnit('pericope', 'userA');
      const revision = getDraftingUnitRevision('userA');

      expect(
        acknowledgeDraftingUnitSync({
          userId: 'userA',
          capturedUserId: 'userB',
          capturedRevision: revision,
          capturedIntent: 'pericope',
          acknowledgedDisplayMode: 'pericope',
          acknowledgedDisplayModeKeyPresent: true,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(false);
      expect(isDraftingUnitDirty('userA')).toBe(true);
    });

    it('reset omit ACK clears only when capabilities supported', () => {
      resetDraftingUnitPreference('user1');
      expect(getDraftingUnit('user1')).toBe('verse');
      expect(getDisplayModeSyncIntent('user1')).toBeNull();
      const revision = getDraftingUnitRevision('user1');

      // Fail-before: omit without capabilities (legacy strip shape) keeps dirty
      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: revision,
          capturedIntent: null,
          acknowledgedDisplayMode: undefined,
          acknowledgedDisplayModeKeyPresent: false,
          settingsCapabilitiesSupported: false,
        }),
      ).toBe(false);
      expect(isDraftingUnitDirty('user1')).toBe(true);

      // Pass-after: capability-bearing normalized omit acknowledges delete
      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: revision,
          capturedIntent: null,
          acknowledgedDisplayMode: undefined,
          acknowledgedDisplayModeKeyPresent: false,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(true);
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('reset ACK also accepts optional null echo when capabilities present', () => {
      resetDraftingUnitPreference('user1');
      const revision = getDraftingUnitRevision('user1');

      expect(
        acknowledgeDraftingUnitSync({
          userId: 'user1',
          capturedUserId: 'user1',
          capturedRevision: revision,
          capturedIntent: null,
          acknowledgedDisplayMode: null,
          acknowledgedDisplayModeKeyPresent: true,
          settingsCapabilitiesSupported: true,
        }),
      ).toBe(true);
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });
  });

  describe('remote apply + dirty + capture deferral', () => {
    it('stale/default GET does not clobber dirty local', () => {
      setDraftingUnit('pericope', 'user1');
      expect(applyRemoteDraftingUnit('user1', 'verse')).toBe('skipped_dirty');
      expect(getDraftingUnit('user1')).toBe('pericope');
    });

    it('clean missing preference defaults to Verse apply', () => {
      expect(getDraftingUnit('user1')).toBe('verse');
      expect(applyRemoteDraftingUnit('user1', 'verse')).toBe('noop');
    });

    it('applies remote when clean', () => {
      expect(applyRemoteDraftingUnit('user1', 'pericope')).toBe('applied');
      expect(getDraftingUnit('user1')).toBe('pericope');
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('defers remote apply while capture is active, then applies on release', () => {
      setRecordCaptureGate(true);
      expect(applyRemoteDraftingUnit('user1', 'pericope')).toBe(
        'deferred_capture',
      );
      expect(getDraftingUnit('user1')).toBe('verse');

      setRecordCaptureGate(false);
      expect(getDraftingUnit('user1')).toBe('pericope');
    });

    it('defers while paused (gate true) and applies after pause ends', () => {
      // Capture gate is true for both recording and paused (#568).
      setRecordCaptureGate(true);
      expect(applyRemoteDraftingUnit('user1', 'pericope')).toBe(
        'deferred_capture',
      );
      flushDeferredRemoteApplies();
      expect(getDraftingUnit('user1')).toBe('verse');

      setRecordCaptureGate(false);
      flushDeferredRemoteApplies();
      expect(getDraftingUnit('user1')).toBe('pericope');
    });

    it('local dirty edit cancels deferred remote for that user', () => {
      setRecordCaptureGate(true);
      applyRemoteDraftingUnit('user1', 'pericope');
      setDraftingUnit('verse', 'user1');
      setRecordCaptureGate(false);
      expect(getDraftingUnit('user1')).toBe('verse');
      expect(isDraftingUnitDirty('user1')).toBe(true);
    });
  });

  describe('isDraftingUnitDirty / clearDraftingUnitDirty', () => {
    it('reports dirty after a write', () => {
      setDraftingUnit('pericope', 'user1');
      expect(isDraftingUnitDirty('user1')).toBe(true);
    });

    it('reports not dirty when unset', () => {
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('returns false for an empty userId', () => {
      expect(isDraftingUnitDirty('')).toBe(false);
    });

    it('clears the dirty flag', () => {
      setDraftingUnit('pericope', 'user1');
      clearDraftingUnitDirty('user1');
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('does nothing for an empty userId', () => {
      clearDraftingUnitDirty('');
      expect(kvStorage.removeItemSync).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToDraftingUnit / notifyDraftingUnitChanged', () => {
    it('notifies subscribed listeners', () => {
      const listener = jest.fn();
      subscribeToDraftingUnit(listener);

      notifyDraftingUnitChanged();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops notifying after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToDraftingUnit(listener);
      unsubscribe();

      notifyDraftingUnitChanged();

      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies on setDraftingUnit', () => {
      const listener = jest.fn();
      subscribeToDraftingUnit(listener);

      setDraftingUnit('pericope', 'user1');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
