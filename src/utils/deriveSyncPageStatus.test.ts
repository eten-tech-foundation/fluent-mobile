import { deriveSyncPageStatus } from './deriveSyncPageStatus';
import type { UploadPhase } from '../services/uploadOrchestratorCore';

const phases: UploadPhase[] = [
  'idle',
  'syncing',
  'paused',
  'waiting_wifi',
  'offline',
];

describe('deriveSyncPageStatus', () => {
  it.each([
    ['syncing', false, false, 'syncing'],
    ['syncing', true, false, 'syncing'],
    ['syncing', false, true, 'syncing'],
    ['paused', false, false, 'paused'],
    ['paused', true, true, 'paused'],
    ['waiting_wifi', true, false, 'pending'],
    ['waiting_wifi', false, true, 'pending'],
    ['offline', true, false, 'pending'],
    ['offline', false, true, 'pending'],
    ['idle', true, false, 'pending'],
    ['idle', false, true, 'pending'],
    ['idle', true, true, 'pending'],
    ['idle', false, false, 'allComplete'],
    ['waiting_wifi', false, false, 'allComplete'],
    ['offline', false, false, 'allComplete'],
  ] as const)(
    'phase=%s pending=%s failed=%s → %s',
    (phase, hasPending, hasFailed, expected) => {
      expect(deriveSyncPageStatus(phase, hasPending, hasFailed)).toBe(expected);
    },
  );

  it.each(['idle', 'waiting_wifi', 'offline'] as const)(
    'does not report allComplete when only unuploadable pending remains (phase=%s)',
    phase => {
      expect(deriveSyncPageStatus(phase, false, false, true)).toBe('pending');
    },
  );

  it.each(['idle', 'waiting_wifi', 'offline'] as const)(
    'does not report allComplete when pending counts are unknown (phase=%s)',
    phase => {
      expect(deriveSyncPageStatus(phase, false, false, false, true)).toBe(
        'pending',
      );
    },
  );

  it.each(['idle', 'waiting_wifi', 'offline'] as const)(
    'does not report allComplete when claims/sync retry work remains (phase=%s)',
    phase => {
      expect(
        deriveSyncPageStatus(phase, false, false, false, false, true),
      ).toBe('pending');
    },
  );

  it.each(['idle', 'waiting_wifi', 'offline'] as const)(
    'reports uploadComplete when uploads are clear but downloads remain (phase=%s)',
    phase => {
      expect(
        deriveSyncPageStatus(phase, false, false, false, false, false, true),
      ).toBe('uploadComplete');
    },
  );

  it('preserves syncing and paused over download-queue signal', () => {
    expect(
      deriveSyncPageStatus('syncing', false, false, false, false, false, true),
    ).toBe('syncing');
    expect(
      deriveSyncPageStatus('paused', false, false, false, false, false, true),
    ).toBe('paused');
  });

  it.each([
    ['hasPendingUploads', true, false, false, false, false],
    ['hasFailedUploads', false, true, false, false, false],
    ['hasUnuploadablePending', false, false, true, false, false],
    ['countsUnknown', false, false, false, true, false],
    ['hasClaimsOrSyncRetryWork', false, false, false, false, true],
  ] as const)(
    'keeps pending when %s is set even if downloads remain',
    (_label, pending, failed, unuploadable, unknown, claims) => {
      expect(
        deriveSyncPageStatus(
          'idle',
          pending,
          failed,
          unuploadable,
          unknown,
          claims,
          true,
        ),
      ).toBe('pending');
    },
  );

  it('covers every UploadPhase value', () => {
    for (const phase of phases) {
      expect(() => deriveSyncPageStatus(phase, false, false)).not.toThrow();
    }
  });
});
