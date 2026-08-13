---
name: write-test
description: >-
  Write a Jest unit test for a file or symbol in fluent-mobile, matching the
  repo's real test conventions (colocated src/**/*.test.ts(x), jest-expo,
  global Expo mocks, QueryClientTestWrapper). Use this skill WHENEVER the user
  asks to write, add, scaffold, or generate a test, unit test, or Jest test for
  any source file, hook, component, service, or util — even if they just say
  "test this file", "cover this with tests", or paste a path under src/. Also
  use when a PR review asks for missing tests.
---

# write-test

Generate a Jest test for a fluent-mobile source file that looks like it was
written by someone who already knows this repo's conventions. The win is mock
setup: each target type has an established pattern; copy the matching canonical
example instead of inventing boilerplate.

## Environment facts (don't re-derive these)

- Jest 29, preset `jest-expo`, `@testing-library/react-native`.
- Config: `jest.config.cjs`. Setup: `jest.env.cjs`, `jest.setup.expo-fs.cjs`.
- **Global module mocks** (mapped in `jest.config.cjs` — do NOT re-mock these
  per file): `expo-secure-store`, `expo-file-system`, `expo-audio`. When a test
  mutates shared mock state, call `resetSecureStoreMock()` /
  `resetFileSystemMock()` / `resetAudioMock()` in `beforeEach` (see
  `src/test/mocks/expoMocks.test.ts`).
- **Tests are colocated** next to source: `src/foo/bar.ts` →
  `src/foo/bar.test.ts` (or `.tsx` for components). The only root-level app
  test is `__tests__/App.test.tsx` (heavy mocks for `op-sqlite`, navigation,
  sync, SVG, icons — follow it when testing root flow).
- There is no MSW. Mocking is per-file via `jest.mock(...)` plus
  `jest.mocked(...)` typed handles.
- Live API test `src/services/fluent-api.test.ts` is **skipped by default**;
  do not copy that pattern for unit tests. Opt-in is
  `RUN_LIVE_API_TESTS=1 npm test -- fluent-api.test.ts`.

See `.cursor/rules/testing.mdc`.

## Workflow

### 1. Identify the target and its type

Read the source file. Classify it into ONE of the types below. When a file is
mixed, prefer the type that covers the symbol the user asked about; if unsure,
test the pure logic first.

| Target type | What it looks like | Canonical example to copy |
| --- | --- | --- |
| Pure logic / util | exported fns, no hooks, no I/O | `src/utils/logger.test.ts`, `src/utils/validateEmail.test.ts` |
| Hook | `use*` with state/effects | `src/hooks/useLogin.test.tsx` |
| Component | screen / layout / ui rendering | `src/components/layout/PageHeader.test.tsx` |
| Service | `FluentAPI` / sync / storage | `src/services/httpClient.test.ts`, `src/services/authSession.test.ts` |
| DB | repository / queries / migrations | `src/db/migrations.test.ts`, `src/db/recordingsRepository.test.ts` |

If you are unsure which example fits, OPEN the candidate example(s) and compare
their shape to the target. The examples are the source of truth.

### 2. Place the test file

Colocate: same directory as the source, `Name.test.ts` or `Name.test.tsx`.
Do **not** invent a centralized `__tests__/unit_tests/` tree.

### 3. Scaffold from the matching example

- Mock ONLY the target's direct dependencies. Skip anything already mapped in
  `jest.config.cjs`.
- Use `jest.mocked(importedFn)` for typed mock handles. Reset with
  `jest.clearAllMocks()` in `beforeEach`.
- For hooks: `renderHook` + `act` / `waitFor` from
  `@testing-library/react-native`. Wrap with `QueryClientTestWrapper` from
  `src/test/queryClientWrapper` when the hook uses react-query (see
  `useLogin.test.tsx`).
- For navigation: mock `@react-navigation/native` (`useNavigation`, `useRoute`)
  the way neighboring screen tests do.
- Mock `op-sqlite` / `getDatabase` the way existing `src/db/*.test.ts` files do.
  Never require a real device for unit tests.

### 4. Verify

Run the single file:

```bash
npm test -- src/path/to/Name.test.ts
```

Fix failures before reporting done. Also keep `npm run typecheck` in mind —
new tests should typecheck.

## Hard rules

- Never re-mock `expo-secure-store`, `expo-file-system`, or `expo-audio`.
- Never put the test under a new centralized `__tests__/unit_tests/` tree —
  colocate next to source.
- Do not add tests that only assert trivial constants.
- `no-console` is off in test files; `no-focused-tests` is error.
- Use **npm** (`npm test -- --ci` for the full suite).
