import {
  applyUserSettingsDisplayMode,
  hasDisplayModeSettingsCapabilities,
  pullDisplayModeSettings,
  pushDirtyDisplayMode,
  resolveDisplayModePushCapture,
  scheduleDisplayModePush,
  syncDisplayModeSettingsForUser,
} from './displayModeSettingsSync';
import {
  getDraftingUnit,
  getDraftingUnitRevision,
  isDraftingUnitDirty,
  resetDraftingUnitPreference,
  resetDraftingUnitPreferenceRuntimeForTests,
  setDraftingUnit,
} from './draftingUnitPreference';
import { FluentAPI } from './api';
import { getConnectivitySnapshot } from './connectivity';
import { getCredentials } from './keychain';
import { getActiveUserId } from './storage';
import {
  resetRecordCaptureGateForTests,
  setRecordCaptureGate,
} from '../navigation/recordCaptureGate';
import { kvStorage } from './storage';

jest.mock('./api', () => ({
  FluentAPI: {
    getSelfSettings: jest.fn(),
    putSelfSettings: jest.fn(),
  },
}));

jest.mock('./connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('./keychain', () => ({
  getCredentials: jest.fn(),
}));

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
    getActiveUserId: jest.fn(() => 'userA'),
  };
});

const mockGetSelfSettings = FluentAPI.getSelfSettings as jest.Mock;
const mockPutSelfSettings = FluentAPI.putSelfSettings as jest.Mock;
const mockGetConnectivity = getConnectivitySnapshot as jest.Mock;
const mockGetCredentials = getCredentials as jest.Mock;
const mockGetActiveUserId = getActiveUserId as jest.Mock;
const mockStore = (kvStorage as unknown as { __store: Map<string, string> })
  .__store;

const CAPABLE = {
  partialMerge: true,
  displayMode: true,
} as const;

const capableGet = (settings: Record<string, unknown> = {}) => ({
  settings,
  updatedAt: '2026-01-01T00:00:00.000Z',
  settingsCapabilities: CAPABLE,
});

const capablePut = (settings: Record<string, unknown> | null) => ({
  settings,
  updatedAt: '2026-01-02T00:00:00.000Z',
  settingsCapabilities: CAPABLE,
});

describe('displayModeSettingsSync', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    resetRecordCaptureGateForTests();
    resetDraftingUnitPreferenceRuntimeForTests();
    mockGetActiveUserId.mockReturnValue('userA');
    mockGetCredentials.mockResolvedValue({ token: 'token-A' });
    mockGetConnectivity.mockResolvedValue({ isOnline: true });
  });

  describe('hasDisplayModeSettingsCapabilities', () => {
    it('requires both flags strictly true', () => {
      expect(hasDisplayModeSettingsCapabilities(undefined)).toBe(false);
      expect(
        hasDisplayModeSettingsCapabilities({
          settings: null,
          updatedAt: null,
        }),
      ).toBe(false);
      expect(
        hasDisplayModeSettingsCapabilities({
          settings: null,
          updatedAt: null,
          settingsCapabilities: { partialMerge: true },
        }),
      ).toBe(false);
      expect(
        hasDisplayModeSettingsCapabilities({
          settings: null,
          updatedAt: null,
          settingsCapabilities: {
            partialMerge: true,
            displayMode: false,
          },
        }),
      ).toBe(false);
      expect(
        hasDisplayModeSettingsCapabilities({
          settings: null,
          updatedAt: null,
          settingsCapabilities: {
            partialMerge: 'true' as unknown as boolean,
            displayMode: true,
          },
        }),
      ).toBe(false);
      expect(
        hasDisplayModeSettingsCapabilities({
          settings: null,
          updatedAt: null,
          settingsCapabilities: CAPABLE,
        }),
      ).toBe(true);
    });
  });

  describe('applyUserSettingsDisplayMode', () => {
    it('clean missing Verse default only when capabilities supported', () => {
      // Fail-before: legacy omit must not apply Verse as cloud authority
      expect(
        applyUserSettingsDisplayMode('userA', {
          settings: { checkIgnoredWordPairs: true },
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ).toBe('noop');
      expect(getDraftingUnit('userA')).toBe('verse');
      expect(isDraftingUnitDirty('userA')).toBe(false);

      // Pass-after: capability-bearing omit defaults Verse
      expect(applyUserSettingsDisplayMode('userA', capableGet({}))).toBe(
        'noop',
      );
      expect(getDraftingUnit('userA')).toBe('verse');
    });

    it('does not let stale GET overwrite dirty local', () => {
      setDraftingUnit('pericope', 'userA');
      expect(
        applyUserSettingsDisplayMode(
          'userA',
          capableGet({ displayMode: 'verse' }),
        ),
      ).toBe('skipped_dirty');
      expect(getDraftingUnit('userA')).toBe('pericope');
    });

    it('applies remote pericope when clean', () => {
      expect(
        applyUserSettingsDisplayMode(
          'userA',
          capableGet({ displayMode: 'pericope' }),
        ),
      ).toBe('applied');
      expect(getDraftingUnit('userA')).toBe('pericope');
    });

    it('present non-enum displayMode noops; omitted/null still default Verse when capable', () => {
      expect(
        applyUserSettingsDisplayMode(
          'userA',
          capableGet({ displayMode: 'pericope' }),
        ),
      ).toBe('applied');
      expect(getDraftingUnit('userA')).toBe('pericope');

      // Present invalid enum must not fall through to Verse default.
      expect(
        applyUserSettingsDisplayMode(
          'userA',
          capableGet({ displayMode: 'VERSE' }),
        ),
      ).toBe('noop');
      expect(getDraftingUnit('userA')).toBe('pericope');
      expect(isDraftingUnitDirty('userA')).toBe(false);

      // Explicit null on a capable server still means Verse default.
      expect(
        applyUserSettingsDisplayMode(
          'userA',
          capableGet({ displayMode: null }),
        ),
      ).toBe('applied');
      expect(getDraftingUnit('userA')).toBe('verse');

      // Omitted key (already covered above for default-verse local) — from
      // pericope, capable omit also defaults Verse.
      expect(
        applyUserSettingsDisplayMode(
          'userA',
          capableGet({ displayMode: 'pericope' }),
        ),
      ).toBe('applied');
      expect(applyUserSettingsDisplayMode('userA', capableGet({}))).toBe(
        'applied',
      );
      expect(getDraftingUnit('userA')).toBe('verse');
    });
  });

  describe('pushDirtyDisplayMode capability gate', () => {
    it('legacy GET without caps: no PUT, dirty kept, suppressions untouched', async () => {
      setDraftingUnit('pericope', 'userA');
      mockGetSelfSettings.mockResolvedValue({
        settings: { checkIgnoredWordPairs: ['a|b'] },
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const capture = await resolveDisplayModePushCapture('userA', 'token-A');
      const cleared = await pushDirtyDisplayMode(capture!);

      expect(cleared).toBe(false);
      expect(mockPutSelfSettings).not.toHaveBeenCalled();
      expect(isDraftingUnitDirty('userA')).toBe(true);
      expect(getDraftingUnit('userA')).toBe('pericope');
      expect(mockGetSelfSettings).toHaveBeenCalledWith('token-A');
    });

    it('partial caps (one false) blocks PUT and keeps dirty', async () => {
      setDraftingUnit('pericope', 'userA');
      mockGetSelfSettings.mockResolvedValue({
        settings: { displayMode: 'verse' },
        updatedAt: '2026-01-01T00:00:00.000Z',
        settingsCapabilities: { partialMerge: true, displayMode: false },
      });

      const capture = await resolveDisplayModePushCapture('userA', 'token-A');
      await pushDirtyDisplayMode(capture!);

      expect(mockPutSelfSettings).not.toHaveBeenCalled();
      expect(isDraftingUnitDirty('userA')).toBe(true);
    });

    it('offline/fail leaves dirty for retry', async () => {
      setDraftingUnit('pericope', 'userA');
      mockGetSelfSettings.mockRejectedValue(new Error('network down'));

      await expect(
        syncDisplayModeSettingsForUser('userA', 'token-A'),
      ).resolves.toBeUndefined();

      expect(isDraftingUnitDirty('userA')).toBe(true);
      expect(getDraftingUnit('userA')).toBe('pericope');
      expect(mockPutSelfSettings).not.toHaveBeenCalled();
    });

    it('clears dirty when capability-bearing ACK echoes value', async () => {
      setDraftingUnit('pericope', 'userA');
      mockGetSelfSettings.mockResolvedValue(
        capableGet({ displayMode: 'verse' }),
      );
      mockPutSelfSettings.mockResolvedValue(
        capablePut({ displayMode: 'pericope' }),
      );

      await syncDisplayModeSettingsForUser('userA', 'token-A');
      expect(isDraftingUnitDirty('userA')).toBe(false);
      expect(getDraftingUnit('userA')).toBe('pericope');
      expect(mockPutSelfSettings).toHaveBeenCalledWith(
        { settings: { displayMode: 'pericope' } },
        'token-A',
      );
      // Capability probe only — post-ACK pull skipped so stubbed Verse cannot win.
      expect(mockGetSelfSettings).toHaveBeenCalledTimes(1);
    });

    it('wrong ACK value keeps dirty after capability-bearing PUT', async () => {
      setDraftingUnit('pericope', 'userA');
      mockGetSelfSettings.mockResolvedValue(capableGet());
      mockPutSelfSettings.mockResolvedValue(
        capablePut({ displayMode: 'verse' }),
      );

      const capture = await resolveDisplayModePushCapture('userA', 'token-A');
      const cleared = await pushDirtyDisplayMode(capture!);
      expect(cleared).toBe(false);
      expect(isDraftingUnitDirty('userA')).toBe(true);
    });

    it('new revision during capability GET skips PUT and keeps dirty', async () => {
      setDraftingUnit('pericope', 'userA');
      const capture = await resolveDisplayModePushCapture('userA', 'token-A');

      mockGetSelfSettings.mockImplementation(async () => {
        setDraftingUnit('verse', 'userA');
        return capableGet();
      });

      const cleared = await pushDirtyDisplayMode(capture!);
      expect(cleared).toBe(false);
      expect(mockPutSelfSettings).not.toHaveBeenCalled();
      expect(isDraftingUnitDirty('userA')).toBe(true);
      expect(getDraftingUnit('userA')).toBe('verse');
    });

    it('ACK after new edit does not clear newer dirty', async () => {
      setDraftingUnit('pericope', 'userA');
      const capture = await resolveDisplayModePushCapture('userA', 'token-A');
      setDraftingUnit('verse', 'userA');

      mockGetSelfSettings.mockResolvedValue(capableGet());
      mockPutSelfSettings.mockResolvedValue(
        capablePut({ displayMode: 'pericope' }),
      );

      await pushDirtyDisplayMode(capture!);
      expect(mockPutSelfSettings).not.toHaveBeenCalled();
      expect(isDraftingUnitDirty('userA')).toBe(true);
      expect(getDraftingUnit('userA')).toBe('verse');
    });

    it('reset capability-bearing omit ACK clears dirty (null echo not required)', async () => {
      resetDraftingUnitPreference('userA');
      mockGetSelfSettings
        .mockResolvedValueOnce(
          capableGet({
            displayMode: 'pericope',
            checkIgnoredWordPairs: true,
          }),
        )
        .mockResolvedValueOnce(capableGet({ checkIgnoredWordPairs: true }));
      mockPutSelfSettings.mockResolvedValue(
        capablePut({ checkIgnoredWordPairs: true }),
      );

      await syncDisplayModeSettingsForUser('userA', 'token-A');

      expect(mockPutSelfSettings).toHaveBeenCalledWith(
        { settings: { displayMode: null } },
        'token-A',
      );
      expect(isDraftingUnitDirty('userA')).toBe(false);
      expect(getDraftingUnit('userA')).toBe('verse');
    });

    it('reset settings:null ACK clears dirty when capabilities present', async () => {
      resetDraftingUnitPreference('userA');
      mockGetSelfSettings.mockResolvedValue(
        capableGet({ displayMode: 'verse' }),
      );
      mockPutSelfSettings.mockResolvedValue(capablePut(null));

      const capture = await resolveDisplayModePushCapture('userA', 'token-A');
      const cleared = await pushDirtyDisplayMode(capture!);
      expect(cleared).toBe(true);
      expect(isDraftingUnitDirty('userA')).toBe(false);
    });
  });

  describe('account switch', () => {
    it('userA response does not clear or overwrite userB dirty', async () => {
      setDraftingUnit('pericope', 'userA');
      setDraftingUnit('verse', 'userB');
      mockGetActiveUserId.mockReturnValue('userB');

      const captureA = await resolveDisplayModePushCapture('userA', 'token-A');
      mockGetSelfSettings.mockResolvedValue(capableGet());
      mockPutSelfSettings.mockResolvedValue(
        capablePut({ displayMode: 'pericope' }),
      );
      await pushDirtyDisplayMode(captureA!);

      expect(isDraftingUnitDirty('userA')).toBe(false);
      expect(isDraftingUnitDirty('userB')).toBe(true);
      expect(getDraftingUnit('userB')).toBe('verse');
    });

    it('pull for userA while B is active writes only A keys', async () => {
      mockGetActiveUserId.mockReturnValue('userB');
      mockGetSelfSettings.mockResolvedValue(
        capableGet({ displayMode: 'pericope' }),
      );

      await pullDisplayModeSettings('userA', 'token-A');
      expect(getDraftingUnit('userA')).toBe('pericope');
      expect(getDraftingUnit('userB')).toBe('verse');
      expect(isDraftingUnitDirty('userB')).toBe(false);
    });

    it('does not reuse another account capability probe for PUT', async () => {
      setDraftingUnit('pericope', 'userA');
      setDraftingUnit('verse', 'userB');

      mockGetSelfSettings.mockImplementation(async (token: string) => {
        if (token === 'token-A') {
          return {
            settings: { checkIgnoredWordPairs: true },
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
        }
        return capableGet();
      });

      const captureA = await resolveDisplayModePushCapture('userA', 'token-A');
      await pushDirtyDisplayMode(captureA!);

      expect(mockGetSelfSettings).toHaveBeenCalledWith('token-A');
      expect(mockPutSelfSettings).not.toHaveBeenCalled();
      expect(isDraftingUnitDirty('userA')).toBe(true);
    });
  });

  describe('stale pull discard (revision gate)', () => {
    it('discards pull when revision moved mid-GET after edit+ACK; other account revision ignored', async () => {
      let resolveStalePull!: (value: unknown) => void;
      const stalePullGet = new Promise(resolve => {
        resolveStalePull = resolve;
      });

      mockGetSelfSettings.mockReturnValueOnce(stalePullGet);
      const pullPromise = pullDisplayModeSettings('userA', 'token-A');

      // Concurrent edit on another account must not discard userA apply by itself.
      setDraftingUnit('verse', 'userB');

      // Mid-flight: local edit + capability GET/PUT ACK clears dirty for userA.
      setDraftingUnit('pericope', 'userA');
      mockGetSelfSettings.mockResolvedValue(capableGet());
      mockPutSelfSettings.mockResolvedValue(
        capablePut({ displayMode: 'pericope' }),
      );
      const capture = await resolveDisplayModePushCapture('userA', 'token-A');
      expect(await pushDirtyDisplayMode(capture!)).toBe(true);
      expect(isDraftingUnitDirty('userA')).toBe(false);
      expect(getDraftingUnit('userA')).toBe('pericope');
      const revisionAfterAck = getDraftingUnitRevision('userA');
      expect(revisionAfterAck).toBeGreaterThan(0);

      // Older pull resolves with pre-edit server value.
      resolveStalePull(capableGet({ displayMode: 'verse' }));
      await pullPromise;

      expect(getDraftingUnit('userA')).toBe('pericope');
      expect(getDraftingUnitRevision('userA')).toBe(revisionAfterAck);
      expect(getDraftingUnit('userB')).toBe('verse');
    });
  });

  describe('capture deferral via pull', () => {
    it('defers pull apply during active capture then applies after', async () => {
      setRecordCaptureGate(true);
      mockGetSelfSettings.mockResolvedValue(
        capableGet({ displayMode: 'pericope' }),
      );

      await pullDisplayModeSettings('userA', 'token-A');
      expect(getDraftingUnit('userA')).toBe('verse');

      setRecordCaptureGate(false);
      expect(getDraftingUnit('userA')).toBe('pericope');
    });
  });

  describe('scheduleDisplayModePush', () => {
    it('no-ops when offline', async () => {
      setDraftingUnit('pericope', 'userA');
      mockGetConnectivity.mockResolvedValue({ isOnline: false });

      await scheduleDisplayModePush('userA');
      expect(mockGetSelfSettings).not.toHaveBeenCalled();
      expect(mockPutSelfSettings).not.toHaveBeenCalled();
      expect(isDraftingUnitDirty('userA')).toBe(true);
      expect(getDraftingUnitRevision('userA')).toBe(1);
    });
  });
});
