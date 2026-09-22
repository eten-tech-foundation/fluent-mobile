const {
  resolveNightlyFailedStep,
} = require('./resolve-nightly-failed-step.cjs');

describe('resolve-nightly-failed-step', () => {
  it('classifies Expo doctor failure as gate_failure', () => {
    expect(
      resolveNightlyFailedStep({
        STEP_DOCTOR: 'failure',
        STEP_BUILD: 'skipped',
      })
    ).toEqual({
      kind: 'gate_failure',
      failedStep: 'Expo doctor',
    });
  });

  it('classifies EAS step failure as build_failure', () => {
    expect(
      resolveNightlyFailedStep({
        STEP_DOCTOR: 'success',
        STEP_EXPO_CHECK: 'success',
        STEP_BUILD: 'failure',
      })
    ).toEqual({
      kind: 'build_failure',
      failedStep: 'EAS nightly Android build (binary only)',
    });
  });

  it('prefers the first failed gate when several are marked', () => {
    expect(
      resolveNightlyFailedStep({
        STEP_FORMAT: 'failure',
        STEP_LINT: 'failure',
        STEP_BUILD: '',
      })
    ).toEqual({
      kind: 'gate_failure',
      failedStep: 'Format check',
    });
  });

  it('returns unknown gate_failure when no step failed', () => {
    expect(resolveNightlyFailedStep({})).toEqual({
      kind: 'gate_failure',
      failedStep: 'unknown',
    });
  });
});
