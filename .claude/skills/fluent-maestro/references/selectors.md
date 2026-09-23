# Fluent Maestro selectors

Prefer runtime evidence: Maestro MCP `inspect_screen` (and screenshot when useful) **before** encoding selectors from JSX alone.

## Preference order

1. Stable semantic `testID` → Maestro `id:`  
2. Stable semantic accessibility label  
3. Stable visible text  
4. Relational selector  
5. Index only when justified  
6. Coordinates last resort  

Do not invent ephemeral ids like `test-step-4-tap-this`. Prefer kebab-case semantic ids, e.g. `drafting-tab-bible`, `source-audio-bar`, `bible-pericope-verse-{chapter}-{verse}` when adding product `testID`s. Follow existing naming in [docs/guides/maestro.md](../../../../docs/guides/maestro.md).

## Existing surfaces (common)

| Surface | Examples |
| --- | --- |
| Auth | `login-email-input`, `login-password-input`, `login-submit-button` |
| Home | `home-tab-my-work`, `home-tab-projects`, `home-settings-button`, `home-sync-button` |
| Lists | `my-work-row-{id}`, `project-row-{id}`, `chapter-row-{id}` |
| Drafting chrome | `drafting-tab-bar`, `drafting-tab-bible` / `-resources` / `-record` |
| Drafting panes | `bible-tab`, `resources-tab`, `record-tab` |
| Source audio | `source-audio-bar`, `source-audio-play`, `source-audio-label` |
| Bible units | `bible-pericope-{key}`, `bible-pericope-verse-{ch}-{v}` (pericope mode); verse rows may still use a11y `Verse N` / visible number |
| Record | `record-start-button`, `record-stop-button`, `record-verse-reference`, `record-new-take-button`, … |
| Resources | `resources-unit-{chapterId}-{verse}` |
| Sync / offline | `sync-screen`, `prepare-offline-screen`, `sync-action-*` |

Header back is often accessibility **“Go back”**, not a dedicated drafting back testID.

## Regex ids

Maestro allows `id: 'my-work-row-.*'` for first-match taps. Prefer a concrete id when the seed account’s first row must be stable.

## Ambiguous text

Visible `text: '3'` can match verse numbers and other UI. Prefer `accessibilityLabel: 'Verse 3'` or a verse/unit testID when flakes appear. Adding a semantic `testID` is appropriate when automation is otherwise ambiguous — that is a product change; in **audit** mode, report the gap instead of silently adding ids unless implementation was authorized.
