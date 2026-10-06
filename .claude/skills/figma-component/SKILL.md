---
name: figma-component
description: >-
  Build a Next-UI React Native component or screen in fluent-mobile from a
  Figma node in the ETEN × Fluent file: read every variant, state and bound
  variable, write the contract, map every value to a Next token, build with
  runtime theming, add tactile motion and haptics, register it in the
  component gallery, and for screens, scrub the app and fluent-api for
  existing functionality to wire to and list it in the PR for devs to check.
  Use this skill WHENEVER the user shares a figma.com link to a component or
  frame, or asks to build, implement, port, or "make real" a component,
  control, screen, or pattern from Figma or the redesign / Next UI / V2, even
  if they don't say "skill".
---

# figma-component

The human-readable procedure is
[`docs/guides/figma-to-component.md`](../../../docs/guides/figma-to-component.md).
Read it fully before step 1; this file is how an agent executes it.

## Environment facts (don't re-derive these)

- Figma file key `VZ23XV2pxvIIAMn12wI4YI`. Foundations page `2308:6`
  (01 Color primitives · 02 Roles · 03 Type · 04 Spacing · 05 Radius ·
  06 Gradients · 07 Tactile · 08 Patterns · 09 Contrast).
- Variable collections: `Primitives` (single mode `Value`) and `Roles`
  (modes `Canvas`, `Hardware`, `Accent`). Effect styles `elevation/*` are
  bound to role variables.
- Two Figma MCP servers may be connected. The desktop bridge needs an active
  selection for `get_variable_defs` and only sees the open file; the remote
  server reads by `fileKey` + `nodeId`. If `get_variable_defs` says "nothing
  selected", use a read-only `use_figma` script instead (load the
  `figma-use` guidance first).
- Code: Next tokens in `src/theme/next*.ts` (never imported from UI; ESLint
  bans it), Legacy in `src/theme/tokens.ts` (frozen). UI reads everything
  through `useTheme()` / `useThemedStyles()` from `src/theme/useTheme`:
  `t.roles.*` (Foundations role names; Hardware by default, Canvas / Accent
  inside `ColorModeScope`, which screens set and components never do), `t.elevation.*`
  (`boxShadow` strings), `t.motion.*`, `t.opacity.disabled`,
  `t.controlSizes.*`, plus the existing `t.spacing` / `t.radius`.
- Haptics: `useHaptics()` from `src/hooks/useHaptics.ts` (no-op in Legacy, silent
  while `src/audio/micActivity.ts` says the mic is open).
- Reference implementations: `src/components/ui/Key.tsx` (pressable, latch)
  and `src/components/ui/Switch.tsx` (controlled value), with gallery entries
  in `src/app/gallery/entries/`. Copy their shape.
- Backend: fluent-api publishes OpenAPI at `https://dev.api.fluent.bible/doc`
  (Scalar UI at `/reference`). `npm run api:coverage -- --tag <tag>` lists
  operations mobile doesn't call yet. Source domains:
  `eten-tech-foundation/fluent-api` `src/domains/` (read with `gh api`).
  `../fluent-web/src/features/` shows how web already uses an endpoint.
- Android-only, Expo CNG, RN New Architecture, Reanimated 4.

## Workflow

### 0. Gate

Stop and tell the user if any of these are missing; don't work around them:

- No `node-id` in the link → ask for a component-level link.
- The component needs a token `Theme` doesn't have yet (type styles,
  gradients, strokes) → say so and propose adding it first
  (guide step 3). Do **not** hardcode hex to get past it.
- No GitHub issue → offer `/start-issue` once one exists; draft locally until then.

### 1. Read the design

Fetch in parallel: `get_design_context` and `get_screenshot` for the node,
plus one read-only `use_figma` script that returns, for the component set:
variant property definitions, each variant's name, and for every node in each
variant the **bound variable names** on fills, strokes, effects, padding,
gap, radius and size (`node.boundVariables`, resolving IDs with
`figma.variables.getVariableByIdAsync`). Also read the relevant Foundations
section text (07 · Tactile for anything pressable).

Output to the user: a variant × state matrix, which modes it appears in, and
any undrawn states (ask, don't invent).

### 2. Contract

Write the contract table from the guide (props, variants, states, modes,
motion, haptic, a11y, signature moment). Get a yes from the user before
building anything non-trivial.

### 3. Token mapping report

One row per visual value: Figma variable → code token. Flag rows with no
token and classify each (unencoded Foundations token / unbound one-off /
component-local geometry) per guide step 3. Unencoded tokens get added to the
`next*` layers in their own commit first.

### 4. Build

Follow guide steps 4 to 6 exactly: `src/components/ui/<Name>.tsx`, runtime
theme only, no raw hex, Reanimated press states with `motion/*` tokens,
reduce-motion fallback, `boxShadow` from roles, semantic `haptics` helper with
recording suppression, a11y role/label/state. Match neighboring components'
import and style patterns.

### 5. Gallery entry

Add `src/app/gallery/entries/<Name>Entry.tsx` and register it in
`entries/index.ts` with the Figma link as a code comment. Live demos only,
no static state grids: a small realistic interaction that reaches every
state (see the Key's transport demo), at the sizes Figma uses it, with
long-text and Telugu samples for text. The gallery always renders Next
(`UiVersionOverride`), so don't add a version toggle.

### 5b. Screens only: wire to what exists

Skip for leaf components (they stay presentational). For a screen, run guide
section "Screens: wire to what exists" before writing screen code:

1. Find the Legacy route + screen for the same job; list every hook/service
   it calls. Next calls the same ones.
2. For each data point and action in the frame, search `src/hooks`,
   `src/db/queries.ts`, `src/services`, `src/audio`, and
   `docs/assessments/<feature>/` (use the Explore agent for a wide sweep).
3. Run `npm run api:coverage -- --tag "<domain>"` for the screen's domains;
   for any lead, read the fluent-api domain and the matching `fluent-web`
   feature to confirm what it does.
4. Classify each element Wired / Available / Missing / Static, with an
   Offline? note, and show the table to the user before building. Available
   items need the services path (types → `FluentAPI` → sync/repository →
   test) and only land if the issue covers them; otherwise propose a
   follow-up. Missing items never get invented endpoints or fake data in the
   screen.

### 6. Test and verify

- Unit test via the `write-test` skill (states, a11y state, disabled
  behavior, haptic on press-in with the helper mocked).
- `npm run typecheck && npm run lint && npm test -- <Name>`. The Legacy
  snapshot may only change additively (new `Theme` groups); anything else
  is a regression.
- If an emulator is attached, open the gallery, drive the demo into each state, screenshot it and
  compare it with the Figma screenshot side by side. Report differences
  honestly.
- Haptics and "feel" can't be verified on an emulator. List the device
  checklist from guide step 9 for a human; never claim it passed.

### 7. Hand off

Hand off to `/create-pr`. In the PR: Figma link, the token mapping report
(collapsed), gallery path under "How to verify", before/after screenshots,
**Needs QA? Yes** if haptics or recording are involved. For screens, add the
**Existing functionality** table (UI element · Status · Source with file or
OpenAPI path · Legacy uses it? · Offline? · Dev check) under Technical
changes, and list every Available / Missing item under Follow-ups with its
issue. Ask reviewers to confirm the wiring in the PR TLDR.

## Don'ts

- Don't import `src/theme/next*` from UI, add keys to `tokens.ts`, or put
  hex in component files.
- Don't call `expo-haptics` directly from components.
- Don't branch on `uiVersion` inside the component. Branch once at the screen.
- Don't build adjacent components the ticket didn't ask for (AGENTS.md gate 2).
- Don't put data hooks or services in `src/components/ui/`, call `fetch`
  from a screen, or add a new data path when the Legacy screen's hook
  already provides it.
