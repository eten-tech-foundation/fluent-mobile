# Next UI

The signed-in app is this UI. Home, the book page, the passage, and Observer
are the product screens. Settings, Sync, Prepare for offline, login, and
legal pages stay on their existing routes and use the same theme. There is
no UI version switch and no classic drafting screen.

## Where things live

| Doc | What it's for |
| --- | --- |
| [Theme](../../guides/ui-version-theming.md) | Hardware, Canvas, Accent, script type, large text |
| [Retirement checklist](retirement-checklist.md) | Route map and workflow owners after #916–#920 |
| [QA process](../../guides/qa-process.md#next-nightly-scenarios) | Upgrade, offline, role, accessibility, and recovery on the nightly |
| [Figma to component](../../guides/figma-to-component.md) | How a Figma component becomes code |
| [Theme and Figma audit](theme-figma-audit.md) | How code tokens line up with Figma Foundations. Dated audit. |
| [v2 feature manifest](v2-feature-manifest.md) | October 2026 plan. Historical. |
| [Open questions](open-questions.md) | Dated design and product questions. Historical record of those answers. |

## Routes

Screens live in `src/app/v2/screens/`. The route file re-exports that screen.
Params, the back stack, and `hrefs` stay on the existing paths. There is no
`/v2` tree and no branch inside the route file.

| Path | Screen | Who |
| --- | --- | --- |
| `(stack)/index` | `HomeScreen` | Signed-in home. Avatar opens Accounts. Sync status opens Sync. |
| `(stack)/chapters` | `BookScreen` | One book. |
| `(stack)/passage` | `PassageScreen` | Listen, Record, resources, questions, Send, recovery. |
| `(stack)/observer-draft` | `ObserverScreen` | Read-only. Home and the book page get here from `resolveChapterOpen`. |
| `(stack)/verse-detail` | Adapter | Old URLs only. Redirects into the passage or Observer. |
| `(app)/settings` | `SettingsScreen` | Prepare for offline, cellular uploads, drafting unit, clear cache, add user, log out. |
| `(stack)/sync` | `SyncScreen` | Sync, including the upload-notification tap. |
| `(stack)/prepare-for-offline` | `PrepareForOfflineScreen` | Downloads. |
| `(auth)/login`, `reauth`, `add-user` | `LoginScreen` | Sign-in. |

`chapterOpen` decides a chapter tap: editable work opens the passage, an
Observer grant plus project membership opens `observer-draft`, and a failed
grant check does not open the editor. A chapter with no project does not open
the editor. Roles: [roles and permissions](../../product-behavior/roles-and-permissions.md).

The passage title sheet (`passage-title-sheet`) holds the book link, Send
when this account may send (`passage-send`), Translation Questions, and
Everyone's takes when another account has takes here. The Resources card is
images and maps. Notes open from the script (Understanding). Record and Listen
are the passage keys. The Official toggle selects the take that may replace
another device's selection ([recordings sync contract](../../guides/recordings-sync-contract.md)).

## Theme

Hardware, Canvas, and Accent are color modes of one theme. The passage hero
and player use Canvas. Note overlays use Accent. Chrome stays Hardware.
Script type is Plus Jakarta Sans and Atkinson Hyperlegible Next, linked for
Android in `app.config.ts`. Large-text behavior is
`theme.fontScale.readingMax` (1.3) plus a hand-capped line height. Details:
[theme guide](../../guides/ui-version-theming.md).

## What stays shared

These are not a second presentation. Retirement did not replace them:

- Auth and launch: `AuthSessionProvider`, `authGate`, `useLaunchEntry`
- Recording: `useRecordSession`, paused-take recovery (`pausedTakes`)
- Listen: `useSourceAudio` (the passage player)
- Observer grants: `userOrgGrants`, `getObserverDraftDestination`
- Stages: stage policy and `stage_advance_queue`. Send on the passage reads that queue.
- Sync, upload, and downloads
- SQLite via `src/db/`

## Saved links and recovery

### Old `/verse-detail` URLs

`src/routes/(app)/(stack)/verse-detail.tsx` classifies the link in
`verseDetailLink.ts` and resolves it in `verseDetailChapter.ts`.

| Link | Result |
| --- | --- |
| `recoverSessionKey` and `recoverVerse` | `resolveRecoveryHref` → passage with that key and verse. The passage keeps those recovery params. |
| Chapter id and chapter name, no recovery | Observer when this account may only observe. Otherwise the passage at verse 1, with names read from the chapter. No recovery params. |
| Missing chapter, no project, unreadable names, or the account changed while resolving | Stays on the adapter. Unread and stale offer **Try again**. Every safe state offers **Go back**. |
| Malformed (no positive chapter id, or a recovery missing the key or verse) | "This link isn't valid." |

The adapter never renders classic drafting.

`hrefs.verseDetail` still builds this path so an already-saved link can be
opened. New chapter navigation uses `hrefs.passage` or the observer href.

### Paused-take markers

`paused_take_markers_v1` in KV is a JSON array of `PausedTakeMarker`
(`src/services/pausedTakes.ts`). A marker needs `sessionKey`, `elapsedMs`,
`startedAt`, and string `segments`. Recovery also needs a positive
`chapterAssignmentId` and `verseNumber`. Optional `capture` freezes the unit
(verse or pericope) from when the take started. Optional `userId` is the
account that paused it; markers from before that field are anyone's, and the
launch prompt still refuses a marker owned by someone else.

`resolveRecoveryHref` (`src/navigation/recoveryHref.ts`) opens the passage
with the saved key and verse. It does not read today's drafting unit or where
the passage now starts. Callers:

- The signed-in layout's launch prompt (`useLaunchRecoveryPrompt`). Resume
  navigates to the passage. A failed resume shows the same alert with
  **Retry** and **Discard**.
- The verse-detail recovery adapter, which copies the same href.

| Status | Meaning |
| --- | --- |
| `open` | Passage href. |
| `missing` | Marker or chapter is gone. |
| `unread` | Names could not be read. Retry can try again. |
| `stale` | The account changed during the read. The result must not be opened. |

## Design direction

From the wayfinding prototype. Still the visual rules for new components:

- **Tactile means listen or record.** Raised hardware controls show up in the
  player. Browsing screens stay flat.
- **Each level has its own shape.** A book is the container, its passages are
  the next level, and the player is the full-page cover.
- **Takes are the progress.**
- **The computer voice is always labelled** when a later ticket connects it.
  Text to speech is not a connected track yet (no API; see the manifest).
- **No breadcrumbs, swipe paging, or "do this next" callouts.**

## Still open

Unbuilt Figma work stays linked. It is not a hidden screen in this app.

- Voice-comment review rounds (#451, #703; [open questions](open-questions.md) Q21–Q23). Everyone's takes on the passage is the owner list, not that design.
- FIA listened-progress tracks (open questions Q11, Q13).
- Known device bugs that predate this UI stay on their issues (the manifest's carry-over list). Do not treat that list as re-verified.

## Historical

The dual-route beta, the Settings version switch, and the `jskager/feature/next-ui-theme`
stack are the October 2026 plan in the [manifest](v2-feature-manifest.md).
Assessments under `docs/assessments/` and the Lovable review keep their
observations. The word "legacy" on a hash format, a cron fallback, or a Metro
fallback is a different term. Leave those.
