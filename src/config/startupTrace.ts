import { isEnvFlagOn } from './e2eMode';

/**
 * Cold-start milestone logging (`src/utils/startupTrace.ts`). Off unless the
 * build sets `EXPO_PUBLIC_STARTUP_TRACE=1`, so a release APK can be measured
 * without turning the development logger on. Never set on production.
 */
export function isStartupTraceEnabled(): boolean {
  return isEnvFlagOn(process.env.EXPO_PUBLIC_STARTUP_TRACE);
}
