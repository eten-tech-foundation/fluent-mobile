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
- Expo Router only — no second navigation library / no direct `@react-navigation/*` app imports.
- After native/Expo bumps: `npm run doctor`. Do not `--fix` on an unrelated feature branch (#422).
