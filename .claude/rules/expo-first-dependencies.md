---
paths:
  - "package.json"
  - "package-lock.json"
  - "app.config.ts"
  - "plugins/**"
---

# Expo-first dependencies (Claude)

Canonical policy: [docs/guides/expo-first-dependencies.md](../../docs/guides/expo-first-dependencies.md) (also in root `AGENTS.md`).

- Prefer Expo-maintained modules; install with `npx expo install`.
- Expo Router only — no second navigation library / no direct `@react-navigation/*` app imports. Use `hrefs`, `useRouter`, `useLocalSearchParams`; import helpers from `expo-router` / `expo-router/drawer` / `expo-router/react-navigation` only.
- After lockfile / native bumps: `npm run doctor`. Do not run `npx expo install --fix` on a feature ticket; use the scheduled Expo SDK alignment PR (`#422`) for online fixes.
