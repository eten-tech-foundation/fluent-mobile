import { isEnvFlagOn } from './e2eMode';

/**
 * Build-time demo feature flags (default off). Add a typed key + env mapping
 * here, then gate the feature entry point with `isDemoFeatureEnabled`.
 * Do not set these true on production EAS profiles.
 *
 * Parsing matches E2E flags (`isEnvFlagOn`: trimmed `'1'` / `'true'`), not the
 * gallery helper which accepts only exact `'true'`.
 */
const DEMO_FEATURE_ENV = {
  prepareOfflineAutoPrompt: 'EXPO_PUBLIC_DEMO_PREPARE_OFFLINE_AUTO_PROMPT',
} as const;

export type DemoFeature = keyof typeof DEMO_FEATURE_ENV;

export function isDemoFeatureEnabled(feature: DemoFeature): boolean {
  return isEnvFlagOn(process.env[DEMO_FEATURE_ENV[feature]]);
}
