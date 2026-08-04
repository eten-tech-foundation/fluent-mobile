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
    ['idle', false, false, 'uploadComplete'],
    ['waiting_wifi', false, false, 'uploadComplete'],
    ['offline', false, false, 'uploadComplete'],
  ] as const)(
    'phase=%s pending=%s failed=%s → %s',
    (phase, hasPending, hasFailed, expected) => {
      expect(deriveSyncPageStatus(phase, hasPending, hasFailed)).toBe(expected);
    },
  );

  it('covers every UploadPhase value', () => {
    for (const phase of phases) {
      expect(() => deriveSyncPageStatus(phase, false, false)).not.toThrow();
    }
  });
});
