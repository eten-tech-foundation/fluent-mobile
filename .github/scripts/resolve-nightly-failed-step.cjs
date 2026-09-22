/**
 * Classify a nightly job failure for Slack: gate (pre-EAS) vs build (EAS).
 * Reads step conclusions from env (GitHub Actions `steps.*.conclusion`).
 *
 * Env (optional; empty / missing ⇒ skipped):
 *   STEP_INSTALL, STEP_API_URL, STEP_FORMAT, STEP_LINT, STEP_TYPECHECK,
 *   STEP_UNIT_TESTS, STEP_DOCTOR, STEP_EXPO_CHECK, STEP_EAS_SETUP, STEP_BUILD
 */

const GATE_STEPS = [
  { env: 'STEP_INSTALL', label: 'Install dependencies' },
  { env: 'STEP_API_URL', label: 'Validate nightly API URL' },
  { env: 'STEP_FORMAT', label: 'Format check' },
  { env: 'STEP_LINT', label: 'Lint' },
  { env: 'STEP_TYPECHECK', label: 'Typecheck' },
  { env: 'STEP_UNIT_TESTS', label: 'Unit tests' },
  { env: 'STEP_DOCTOR', label: 'Expo doctor' },
  { env: 'STEP_EXPO_CHECK', label: 'expo install --check' },
  { env: 'STEP_EAS_SETUP', label: 'Setup EAS' },
];

function conclusion(env, key) {
  return String(env[key] || '').trim();
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ kind: 'build_failure' | 'gate_failure', failedStep: string }}
 */
function resolveNightlyFailedStep(env = process.env) {
  const buildConclusion = conclusion(env, 'STEP_BUILD');
  if (buildConclusion === 'failure') {
    return {
      kind: 'build_failure',
      failedStep: 'EAS nightly Android build (binary only)',
    };
  }

  for (const step of GATE_STEPS) {
    if (conclusion(env, step.env) === 'failure') {
      return { kind: 'gate_failure', failedStep: step.label };
    }
  }

  return { kind: 'gate_failure', failedStep: 'unknown' };
}

function printGithubOutput(env = process.env) {
  const { kind, failedStep } = resolveNightlyFailedStep(env);
  const lines = [`kind=${kind}`, `failed_step=${failedStep}`];
  process.stdout.write(`${lines.join('\n')}\n`);
  return { kind, failedStep };
}

module.exports = {
  GATE_STEPS,
  resolveNightlyFailedStep,
  printGithubOutput,
};

if (require.main === module) {
  printGithubOutput();
}
