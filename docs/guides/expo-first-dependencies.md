# Expo-first dependencies (Fluent Mobile)

Fluent Mobile is an **Expo SDK 56** app (CNG, Android-only). For **new** dependencies and APIs, prefer **Expo-maintained** packages and modules when Expo provides a supported option.

This is policy for agents and humans — **not** a mandate to rewrite existing stacks in the same PR.

## Default preference

| Prefer | Over | Why |
| --- | --- | --- |
| Expo SDK modules (`expo-*`) | Community RN alternatives that duplicate the same capability | Aligned with Expo SDK, CNG, EAS, and `expo-doctor` |
| `npx expo install <pkg>` | Raw `npm install` for Expo/RN native modules | Pins SDK-compatible versions |
| Expo docs / Expo MCP | Memory or random blogs | SDK APIs change; see [expo-mcp.mdc](../../.cursor/rules/expo-mcp.mdc) |

Examples already on this baseline: `expo-audio`, `expo-file-system`, `expo-secure-store`, `expo-updates`, `expo-dev-client`.

## Navigation

Expo’s documented choice for Expo apps is **[Expo Router](https://docs.expo.dev/router/introduction/)** (file-based routing on top of React Navigation). Plain **React Navigation** remains valid, especially for existing apps.

**This repo today:** `@react-navigation/native` + `@react-navigation/stack` under `src/navigation/`.

**Agent rules:**

1. **Do not** introduce a second navigation framework (e.g. React Native Navigation, or a parallel router) alongside the current stack.
2. **Do not** migrate the whole app to Expo Router without a **ticketed** effort and tech-lead approval — that is a cross-cutting change.
3. For **new** greenfield navigation architecture or a ticket that explicitly asks for Expo Router, prefer **Expo Router** over adding more bespoke React Navigation structure.
4. When extending today’s navigators, stay consistent with existing React Navigation patterns until a migration ticket lands.

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
