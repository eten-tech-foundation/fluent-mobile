# Expo-first dependencies (Fluent Mobile)

Fluent Mobile is an **Expo SDK 57** app (CNG, Android-only). For **new** dependencies and APIs, prefer **Expo-maintained** packages and modules when Expo provides a supported option.

This is policy for agents and humans — **not** a mandate to rewrite existing stacks in the same PR.

## Default preference

| Prefer | Over | Why |
| --- | --- | --- |
| Expo SDK modules (`expo-*`) | Community RN alternatives that duplicate the same capability | Aligned with Expo SDK, CNG, EAS, and `expo-doctor` |
| `npx expo install <pkg>` | Raw `npm install` for Expo/RN native modules | Pins SDK-compatible versions |
| Expo docs / Expo MCP | Memory or random blogs | SDK APIs change; see [expo-mcp.mdc](../../.cursor/rules/expo-mcp.mdc) |

Examples already on this baseline: `expo-audio`, `expo-file-system`, `expo-secure-store`, `expo-updates`, `expo-dev-client`.

## Navigation

Expo’s documented choice for Expo apps is **[Expo Router](https://docs.expo.dev/router/introduction/)** (file-based routing; React Navigation is an implementation detail under the hood).

**This repo today:** **Expo Router** (`expo-router`) with file-based routes in `src/routes/`. Screens remain under `src/app/screens/` and `src/app/tabs/`; auth/session lives in `src/navigation/AuthSessionProvider.tsx`. Drawer layout uses `expo-router/drawer` (bundled in SDK 56+ — do **not** add `@react-navigation/drawer` / `@react-navigation/native` as direct app deps).

**Agent rules:**

1. **Do not** introduce a second navigation framework (e.g. React Native Navigation, or a parallel hand-wired React Navigation stack) alongside Expo Router.
2. Prefer Expo Router layouts (`Stack`, `Drawer`, route groups) over bespoke Modal navigators for new surfaces.
3. Use `hrefs` from `src/navigation/hrefs.ts` and `useRouter` / `useLocalSearchParams` from `expo-router` — do not reintroduce `createStackNavigator` / `AppNavigator` / standalone `@react-navigation/*` imports in app code.
4. Import navigation helpers from `expo-router` / `expo-router/drawer` / `expo-router/react-navigation` only (Metro rejects direct `@react-navigation/*` imports under SDK 56+).

## Other common choices

| Need | Prefer (Expo) | Avoid adding when Expo covers it |
| --- | --- | --- |
| Audio record/playback | `expo-audio` | Ad-hoc native audio stacks / abandoned community recorders |
| Filesystem | `expo-file-system` | `react-native-fs` (anti-pattern on this baseline) |
| Secure storage | `expo-secure-store` | Rolling your own Keystore wrapper |
| Network reachability | `@react-native-community/netinfo` (already used) or Expo-documented equivalents | Extra net libraries without a ticket |
| Updates / OTA | `expo-updates` | Custom OTA clients |

If Expo has no module for the capability, community libraries are fine — still install with `npx expo install` when the package is in the Expo compat set, and run `npm run doctor` after native-impacting bumps.

## Install checklist (new native / Expo module)

1. Confirm need against an existing Expo package ([Expo SDK reference](https://docs.expo.dev/versions/latest/) / Expo MCP).
2. `npx expo install <package>` (not unpinned `npm install` for Expo modules).
3. Config plugins only via `app.config.ts` — never hand-edit generated `android/`.
4. Android-only: no iOS-only packages or plugins ([android-only.mdc](../../.cursor/rules/android-only.mdc)).
5. After lockfile / native bumps: `npm run doctor`; fix with `npx expo install --fix` when doctor reports SDK drift.

## Related

- Cursor pointer: [`.cursor/rules/expo-first-dependencies.mdc`](../../.cursor/rules/expo-first-dependencies.mdc)
- Expo MCP: [`.cursor/rules/expo-mcp.mdc`](../../.cursor/rules/expo-mcp.mdc)
- Onboarding: [docs/AGENT_ONBOARDING.md](../AGENT_ONBOARDING.md)
