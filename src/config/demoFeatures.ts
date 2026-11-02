import { isEnvFlagOn } from './e2eMode';

/**
 * Build-time demo feature flags (default off). Add a typed key + env getter
 * here, then gate the feature entry point with `isDemoFeatureEnabled`.
 * Do not set these true on production EAS profiles.
 *
 * Parsing matches E2E flags (`isEnvFlagOn`: trimmed `'1'` / `'true'`), not the
 * gallery helper which accepts only exact `'true'`.
 *
 * Each getter must use literal `process.env.EXPO_PUBLIC_*` dot access so Expo
 * can statically inline the value at build time — computed
 * `process.env[key]` is not inlined
 * (https://docs.expo.dev/guides/environment-variables/).
 */
const DEMO_FEATURE_ENV = {
  // Literal dot access so Expo inlines the EXPO_PUBLIC_ value at build time.
  prepareOfflineAutoPrompt: () =>
    process.env.EXPO_PUBLIC_DEMO_PREPARE_OFFLINE_AUTO_PROMPT,
} as const;

export type DemoFeature = keyof typeof DEMO_FEATURE_ENV;

export function isDemoFeatureEnabled(feature: DemoFeature): boolean {
  return isEnvFlagOn(DEMO_FEATURE_ENV[feature]());
}
