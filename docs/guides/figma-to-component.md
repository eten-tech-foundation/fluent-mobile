# Figma → component workflow (Next UI)

How we turn a component in the ETEN × Fluent Figma file into a Next-UI
component in this repo, and how we check that it looks, moves and *feels*
right on an Android device. Agents run this as the
[`figma-component`](../../.claude/skills/figma-component/SKILL.md) skill.

Read [ui-version-theming.md](ui-version-theming.md) first. This guide assumes
the Legacy / Next split described there.

## What's in place

| Need | Where |
| --- | --- |
| Foundations roles, all three modes | `theme.roles.*` via `useTheme()` / `useThemedStyles()`; wrap a subtree in `ColorModeScope` for Canvas or Accent (Hardware is the default) |
| Effect styles as `boxShadow` | `theme.elevation.raised` · `inset` · `soft` · `floating` |
| Motion | `theme.motion.pressMs` · `releaseMs` · `easeStandard` |
| Disabled opacity, icon sizes | `theme.opacity.disabled` · `theme.controlSizes.icon24` / `icon32` |
| Radius `xs` (4), space `2` | `theme.radius.xs`, `theme.spacing.xxs` |
| Haptics | `useHaptics()` from `src/hooks/useHaptics.ts` |
| Review screen | `/gallery` (`fluent://gallery`), entries in `src/app/gallery/entries/` |
| Reference components | `src/components/ui/Key.tsx` (Figma Key, `2326:34`) in `KeyDeck.tsx` (Hardware panel keys, `2411:465`) · `src/components/ui/Switch.tsx` (Figma Switch, `2326:41`) |

Legacy carries the same keys with nearest-equivalent values, so components
never branch on UI version. Components never pick a mode either: they read
`theme.roles` and the screen decides the mode with `ColorModeScope`. Not yet
available: the full type scale and gradients. See
[theme-figma-audit.md](../features/next-ui-redesign/theme-figma-audit.md).

Inputs: a GitHub issue on Project 4, and a Figma link **with a `node-id`**
pointing at the component (or component set), not the page.

## The loop

### 1. Read the design, all of it

- Pull the component set, not one variant. List every variant property and
  every state frame (Default, Pressed, Latched, Disabled, Loading, Error…).
- Pull the **bound variables**, not just the rendered values. A fill of
  `#E6E5DD` is `surface/default` in Hardware and something else in Canvas.
  Code must use the role.
- Note which **mode** the component sits in (Canvas, Hardware, Accent). The
  same component often appears in more than one.
  Not every role is meant for every mode: some Canvas / Accent values only
  exist because Figma's variable table needs one per mode. If a component
  looks off in a mode it isn't designed for (the Key's deck turns light in
  Canvas), that's expected; don't change tokens for it without design.
- Read the Foundations notes for the pattern you're building (07 · Tactile has
  the state table and RN `boxShadow` strings; 04 · Spacing has touch-target
  and motion rules; 09 · Contrast has the ratios).

If a state isn't drawn, ask the designer before inventing one. Pressed and
Disabled are the ones most often missing.

### 2. Write the contract before code

Put this in the issue or PR, short:

| Field | Example (Transport key) |
| --- | --- |
| Props | `icon`, `onPress`, `active?`, `announceLatched?`, `disabled?`, `accessibilityLabel` |
| Variants | `primary` (wide, shaded) · `secondary` |
| States | default · pressed · latched (`active`) · disabled |
| Modes | Canvas |
| Motion | press-in `motion/press` · release `motion/release` · `ease-standard` |
| Haptic | `press` on press-in · none during a take |
| A11y | `role=button`, action label (Play / Pause) with `announceLatched={false}` → `state={ disabled }`, 48dp target |
| Signature moment | the key sinks `space/4` into an inset well |

### 3. Map every value to a token

Make a mapping table from the Figma inspect panel. Every row must land on a
token. If a value has no token:

1. It's a Foundations token we haven't encoded → add it to
   `nextPrimitives` / `nextRoles` / `nextFoundation` first (separate commit).
2. It's a one-off the designer didn't bind → ask them to bind it in Figma.
3. It's genuinely component-local geometry (a 120px primary key width) →
   a named constant in the component file is fine. Colors never qualify.

No raw hex in component files. No new keys in `tokens.ts` (that's Legacy).
If a component needs a new `Theme` group, add it in `legacy.ts` with the
nearest Legacy value, then override it in `next.ts` (that's how `roles`,
`elevation` and `motion` got there).

When the component's bound variables disagree with its Figma description or
the Foundations notes, build what's bound, flag the mismatch in the PR, and
get the Figma side updated so the two stay in sync. The Key and Switch had
three (lip color, sink depth, knob color); their descriptions and the
07 · Tactile notes were corrected on 2026-10-06.

### 4. Build

- **Where:** `src/components/ui/<Name>.tsx`, colocated `<Name>.test.tsx`.
  No `Next` prefix, since Legacy goes away eventually.
- **Styles:** `useThemedStyles(t => …)` reading `t.roles`, `t.elevation`,
  `t.spacing`, `t.radius`. Never module-level `StyleSheet.create` with theme
  values (it pins Legacy).
- **Same component or new one?** If Legacy and Next differ only in tokens,
  it's one component. If the structure differs, build a new component and
  pick between them once at the screen boundary (`useUiVersion()`), not
  inside leaf components.
- **Keep components presentational.** Props in, callbacks out. No data
  hooks, queries or services inside `src/components/ui/`, so screens own
  the wiring and the gallery can render any state with plain props.
- **Press handling:** `Pressable` from `react-native` (or `react-native-gesture-handler`
  inside scroll/gesture contexts). Set `android_disableSound` and leave
  `android_ripple` off on tactile controls, since the tactile style *is* the
  feedback. Plain list rows can opt into a Material ripple.
- **Dependencies:** Expo SDK packages first
  ([expo-first-dependencies.md](expo-first-dependencies.md)).

### 5. Tactile and motion

Figma 07 · Tactile defines the state model. In code:

| State | Visual | RN |
| --- | --- | --- |
| Default | `surface/default` + `elevation/raised` | `t.roles.surfaceDefault`, `t.elevation.raised` |
| Pressed | face sinks `space/4`: `surface/sunken` + `elevation/inset`, icon `fg/primary` | `t.spacing.xs` offset, `t.elevation.inset` |
| Latched | same as Pressed, held | `active` prop |
| Disabled | Key stays solid; icon fades to `opacity/disabled` | `t.opacity.disabled` on the icon + `disabled` |

- Animate press-in over `t.motion.pressMs` (80) and release over
  `t.motion.releaseMs` (180), both `Easing.bezier` from
  `t.motion.easeStandard`, on a Reanimated shared value so it runs on the
  UI thread. Start the sink in `onPressIn`, then settle from an effect on
  `pressed || active`: Android can call `onPressOut` after `onPress` on quick
  taps, so animating out from `onPressOut` latches wrong (see `Key.tsx`).
- `boxShadow` strings don't interpolate, so stack the states and fade only
  the top layer: keep the sunken face fully opaque underneath and fade the
  raised face over it. Fading both (`1 − p` / `p`) lets the background show
  through mid-press and reads as a flash, worst on the dark `KeyDeck`. Same
  for color changes: stack the down-state icon over the resting one and fade
  only the top icon, instead of swapping the color. `Key.tsx` is the
  reference.
- Disabled in the deck: Figma fades the whole Key to `opacity/disabled`, but
  on the dark `KeyDeck` that turns muddy. We keep the key solid and fade only
  the icon to `opacity/disabled`. Figma's Key / State=Disabled was updated to
  match on 2026-10-06. Don't use `fg/inactive` for it: in Canvas and Accent it's the same
  color as `surface/default`, so the glyph disappears. Check every disabled
  or inactive state in all three modes with the gallery's Mode switcher.
- Respect reduce motion: `useReducedMotion()` from Reanimated. Snap between
  states instead of animating; keep the haptic.
- `boxShadow` (with `inset`) needs the New Architecture and parents with
  `overflow: 'visible'`. Check it on a low-end device; stacked inset shadows
  aren't free.
- **Mind the Android floor.** The app's `minSdkVersion` is 24, but RN draws
  outset `boxShadow` only on API 28+ and inset only on API 29+. Below that,
  tactile components render flat: no crash, no depth. Make sure every state
  still reads without shadows (color, icon, position), and smoke-test an
  API 28 emulator before calling a tactile component done.
- Gradients: hard-stop faces can be two stacked `View`s (no gradient needed).
  Real gradients: `expo-linear-gradient` (Expo-first) unless `react-native-svg`
  is already in the component.

### 6. Haptics

Haptics are part of the design, so they go in the contract. Use the
semantic `useHaptics()` hook in `src/hooks/useHaptics.ts`, never
`expo-haptics` directly in components. It has `press()` and `toggle(on)` today; add a method when a component needs
one, using this mapping:

| Interaction | Helper | Android constant |
| --- | --- | --- |
| Hardware key press-in | `haptics.press()` | `Virtual_Key` |
| Key release (only if the design wants a two-step click) | `haptics.release()` | `Virtual_Key_Release` |
| Switch on / off | `haptics.toggle(on)` | `Toggle_On` / `Toggle_Off` |
| Segmented control, stepper tick | `haptics.tick()` | `Segment_Tick` |
| Scrubbing past a verse or marker | `haptics.tick()` (throttled) | `Segment_Tick` |
| Long press recognized | `haptics.longPress()` | `Long_Press` |
| Drag picked up / dropped | `haptics.dragStart()` / `dragEnd()` | `Drag_Start` / `Gesture_End` |
| Commit (advance stage, save take) | `haptics.confirm()` | `Confirm` |
| Blocked or failed action | `haptics.reject()` | `Reject` |

Rules:

- Use `Haptics.performAndroidHapticsAsync`. It goes through the system haptics
  engine, respects the user's touch-feedback setting and doesn't use
  `VIBRATE` at runtime (though `expo-haptics` still merges
  `android.permission.VIBRATE` into the manifest; it's a normal permission,
  no prompt). `impactAsync` and friends use the raw `Vibrator` on Android and
  feel buzzy.
- **No haptics for the whole take, recording or paused.** The motor is
  audible in recordings, and a haptic on the resume tap would land as capture
  restarts. Fire the record-start haptic *before* capture begins, and
  suppress everything until the take stops. `useRecordingEngine` sets
  `src/audio/micActivity.ts` and the helper checks it, so components don't
  have to remember.
- Fire on **press-in** for keys (feels mechanical), on **commit** for
  confirms, never on scroll, never on async results the user didn't just
  cause.
- One haptic per gesture. Throttle ticks (≥ 50 ms apart) when you add `tick()`.
- The helper is a no-op in Legacy, so Legacy stays as shipped.

### 7. Add it to the gallery

Every Next component gets a gallery entry before review: a
`src/app/gallery/entries/<Name>Entry.tsx` registered in
`entries/index.ts` (see `KeyEntry.tsx`). Entries are **live demos only**,
no static state grids. Build a small, realistic interaction that walks the
component through its states, the way the Key's transport demo latches Play
and disables the skip keys at the first and last verse. Each entry covers:

- every state in the contract reachable through real use, including disabled
  and latched (the Switch demo disables "Loop this verse" while auto-play is
  on). If a state or prop can't come up naturally, add a second small demo
  rather than a static grid. If no Figma screen uses a prop value at all
  (the Key's `Lip=false`), drop it from the ticket's AC instead of inventing
  a demo for it. Keeping the prop itself is fine when it mirrors the Figma
  component's API (the Key keeps `lip`, which Code Connect can map).
- the sizes it's actually used at in Figma (the Key appears at 135 × 96
  and 72 × 72). Check the Figma instance at each size before assuming the
  component scales: the 72 × 72 Key keeps the same 12 → 8 lip, so the
  constants hold, but verify, don't assume.
- long-text and Telugu samples for anything with text

Put the Figma link as a comment on the entry in `entries/index.ts`, not in
the UI (it can't open on the phone).

### 8. Test

- Unit test with the [`write-test`](../../.claude/skills/write-test/SKILL.md)
  skill: renders each state, `accessibilityState` follows props, `onPress`
  doesn't fire when disabled, and the haptic method and trigger from the
  component's contract (mock `useHaptics`): `press()` on press-in for a Key,
  `toggle(on)` on commit for a Switch.
- Legacy snapshot (`legacyTheme.test.ts`) may only change additively (new
  `Theme` groups); any changed or removed value is a regression.

### 9. Feel it on a device

Unit tests can't tell you if a key feels right. On an Android device or
emulator (haptics need a real device):

- [ ] Gallery demos: every state matches Figma side by side (screenshot vs
      `get_screenshot`)
- [ ] Press feels immediate; release settles; no flicker on fast taps
- [ ] Haptics fire once, at the right moment, and not during a take (recording or paused)
- [ ] Settings → Interface → UI version → Legacy: nothing changed
- [ ] TalkBack: label, role and state read correctly; focus order sensible
- [ ] Font size at largest + Display size at largest: nothing clips
- [ ] Remove animations (Accessibility) on: states snap, nothing breaks
- [ ] Low-end device or throttled emulator: no dropped frames on press

### 10. Ship

Normal delivery: `/start-issue` → `/create-pr`, `Refs #NNN`, PR template. Mark
**Needs QA? Yes** when the component adds haptics or touches recording, since
those need a human on a device ([qa-process.md](qa-process.md)). Include
before/after screenshots and the gallery path in "How to verify".

Before asking for review (from the first component PR's feedback):

- [ ] Branch rebased on `main`.
- [ ] Every product rule the component relies on (e.g. haptics silent for the
      whole take) is decided once and worded the same in code, guide and
      skill. Ambiguous wording gets copied as two different behaviors.
- [ ] Status docs you touched (like the theme audit) read correctly from the
      top, not just in a status section at the end.
- [ ] The Android floor is noted for any newer style feature (see
      gotchas), with an API 28 smoke test for tactile components.
- [ ] Tests reset all shared module state they touch (every mic owner, for
      example), so one failure can't cascade.

Optional once it's merged: map the Figma component to the code component with
Code Connect, so future `get_design_context` calls return our component
instead of generated markup.

## Screens: wire to what exists

When a Figma frame becomes a real screen, most of what it shows is already
built somewhere: a hook, a query, a sync step, or an API endpoint. Find it
and use it before writing anything new, then show your work in the PR so a
dev can check the wiring.

### 1. Start from the Legacy screen

Find the Legacy route (`src/routes/`) and screen (`src/app/`) that does the
same job and list every hook and service it calls. That's the default wiring
for the Next screen. Next must call the same hooks: the theming guide forbids
forking sync, recording, DB or auth behavior by UI version.

### 2. Scrub the app for existing functionality

For each piece of data or action in the design, look in this order:

| Where | What lives there |
| --- | --- |
| `src/hooks/use*.ts` | Screen-facing state and actions (sync, recording, playback, downloads, assignments) |
| `src/db/queries.ts` | SQLite reads. UI is SQLite-first: read local data after sync |
| `src/services/` | `FluentAPI` (`api.ts`), sync, upload orchestrator, stage advance, preferences ([services/AGENTS.md](../../src/services/AGENTS.md)) |
| `src/audio/` | Recording and playback engines |
| `docs/assessments/<feature>/` | Audited behavior and known gaps per feature |
| `docs/features/<slug>/` | Specs and plans for in-flight features |

### 3. Scrub the backend for what mobile doesn't call yet

```bash
npm run api:coverage -- --tag "chapter assignments"
```

This reads the live OpenAPI doc (`https://dev.api.fluent.bible/doc`, browsable
at `/reference`) and lists operations the mobile client doesn't call, filtered
by tag. Drop `--tag` to see everything. For anything promising, check how
`fluent-web` uses it (`../fluent-web/src/features/<feature>/`) and the
domain in
[fluent-api](https://github.com/eten-tech-foundation/fluent-api/tree/main/src/domains).
Matching is by path shape and ignores the HTTP method (a called path can hide
an uncalled method on it), so treat results as leads.

### 4. Classify every element in the design

| Status | Meaning | What to do |
| --- | --- | --- |
| **Wired** | An app hook or query already provides it | Use it. Same hook as Legacy where one exists |
| **Available** | The API has it; mobile doesn't call it | Add it the services way (types → `FluentAPI` → sync + repository if cached → test). If the issue doesn't cover it, file a follow-up and leave it out |
| **Missing** | Nothing exists, app or API | Don't invent an endpoint or fake data in the screen. Show it with fixtures in the gallery only, file a follow-up, and waive the AC in the issue |
| **Static** | Pure UI (copy, layout, decoration) | Nothing to wire |

Also note **offline** for each wired item. Anything read straight from the
API instead of SQLite won't work offline, and the going-offline assessment
shows how much that matters here.

### 5. Call it out in the PR

Under **Technical changes**, add an **Existing functionality** table. It's the
thing reviewers check the screen against:

| UI element | Status | Source | Legacy uses it? | Offline? | Dev check |
| --- | --- | --- | --- | --- | --- |
| Chapter list | Wired | `useProjectChapters` (`src/hooks/useProjectChapters.ts`) | Yes, `ViewProject` (`src/app/tabs/ViewProject.tsx`) | Yes | Same hook, same sort |
| Chapter progress ring | Available | `GET /projects/{projectId}/chapter-assignments/progress` | No | No | OK to add a `FluentAPI` method? |
| Presence ("someone else is editing") | Missing on mobile | `POST /chapter-assignments/{id}/presence` (web only) | No | No | Follow-up #NNN |

Then list every **Available** or **Missing** item under **Follow-ups** with
its issue. Don't bury a gap in "known limitations" (AGENTS.md gate 1).

## Android mobile gotchas

**Touch**

- Targets ≥ 48 dp (Figma rule). Small visuals (chips, dots, 24px icons) get
  `hitSlop`, not bigger visuals.
- Don't nest pressables inside a scroll view without checking the gesture
  conflicts. Use RNGH `Pressable` there if taps get eaten.
- Handle the hardware back button for anything modal (sheets, drawers).

**Text**

- `includeFontPadding: false` on every text style (Figma rule), and
  `textAlignVertical: 'center'` when vertically centering single lines.
- Reading text: `maxFontSizeMultiplier={1.3}` (Figma rule). Everything else
  scales. Test at the largest system font.
- Custom fonts on Android: one family name per weight file. `fontWeight`
  won't synthesize weights from a single file, and variable font axes
  aren't supported.
- Telugu needs taller line heights (see `type/telugu/*`). Always test with
  Telugu sample text, because clipped ascenders are the classic failure.
- Casing comes from the style (overline, meta), not typed caps, so screen
  readers don't spell it out.

**Layout and system UI**

- The app is edge-to-edge. Use `useSafeAreaInsets()` for top and bottom
  padding; Figma's `space/48` top inset is a stand-in for the status bar.
- Canvas (dark) screens need light status-bar and nav-bar icons; Hardware
  needs dark. Set them per screen, not per component.
- Don't assume a 412dp width. Test the gallery on a small phone (360dp).

**Visual effects**

- `boxShadow` inset/outset: New Architecture only, parent `overflow: visible`,
  watch performance on long lists. Outset needs API 28+, inset API 29+;
  older devices (we support API 24) get no shadow at all.
- Before using any newer RN style feature, check its Android floor against
  `minSdkVersion` (24). The RN source says it plainly, e.g.
  `MIN_INSET_BOX_SHADOW_SDK_VERSION` in `InsetBoxShadowDrawable.kt`.
- Avoid `elevation` (the Android prop) on tactile components. It fights
  `boxShadow` and can't do inset.
- Contrast: check the role pairs against Figma 09 · Contrast. `fg/inactive`
  and `border/rim` are exempt by design, nothing else is.

**Motion**

- Run press animations on the UI thread (Reanimated), never `setState` per frame.
- Honor reduce motion. Keep durations from tokens, never literal ms.

**Accessibility**

- `accessibilityRole`, `accessibilityLabel` on icon-only controls,
  `accessibilityState` for `disabled`, `selected` (latched keys) or
  `checked` (switches).
- Latched/toggle state can't be conveyed by color or depth alone.
- Toggle-style controls get one pattern, not both: either a fixed label with
  the latch announced (`selected` / `checked`), or a label that names the
  action (Play / Pause) with the latch not announced (`announceLatched={false}`
  on Key). Both together reads as "Pause, selected".

**Audio app specifics**

- No haptics, sounds or vibration for the whole take (recording or paused).
- `android_disableSound` on controls used during playback or record.
- Transport controls must stay responsive while audio is loading. Show a
  state, don't block the press.

**Theming**

- `useThemedStyles` factories must be theme-only (see the theming guide).
- Never import `src/theme/next*` directly. ESLint will stop you.
- Don't branch on `uiVersion` inside leaf components.

## Component gallery

The review screen for tapping and feeling components in isolation.

- **Open it:** `fluent://gallery` (`adb shell am start -a android.intent.action.VIEW -d fluent://gallery`),
  the **Component gallery** link under the login form, or Settings →
  Interface → Component gallery. It works signed out, so designers don't
  need an account.
- **Flag:** `EXPO_PUBLIC_COMPONENT_GALLERY=true` (`src/config/componentGallery.ts`).
  It's set in the `development`, `preview` and `nightly` EAS profiles, so the
  nightly APK carries it for design review. Never in `production`. Locally,
  add it to `.env` and restart Metro.
- **Route:** top-level `src/routes/gallery.tsx`, registered in the root
  layout behind `Stack.Protected guard={isComponentGalleryEnabled()}`.
- **Always Next:** the screen wraps itself in `UiVersionOverride` (from
  `src/theme/useTheme`), so it renders and vibrates as Next whatever the
  device's UI version is. Check Legacy in the real screens, not here.
- **Controls:** **Mode** (Canvas · Hardware · Accent) puts the demo stage in
  that Figma color-role mode through `ColorModeScope`; the header and
  controls stay in Hardware. **Simulate recording** marks the mic active so
  you can confirm haptics go quiet.
- **Entries:** one file per component under `src/app/gallery/entries/`,
  registered in `entries/index.ts`. No auto-discovery, no Storybook.
