# Workflow parity and retirement checklist

Status: design for #907. Not a runtime change. Part of #894.

Next becomes the only UI after the workflows below have a Next destination,
an owner, and the evidence named here. Deleting a route or flipping the UI
preference is not that proof. Line numbers are from fluent-mobile `main`
`c1b3ac51`.

This ticket closes when the checklist is accepted. #908–#914 may start from
the destinations below. They do not have to finish before this document is
accepted. Epic signoff is separate and is not this PR.

## What is still classic

| Entry | Where | What it still does |
| --- | --- | --- |
| Classic drafting | `src/routes/(app)/(stack)/verse-detail.tsx` re-exports `DraftingScreen` | Send, resources the player does not host, all-owner review, and the recovery cases below |
| Open in classic drafting | `src/app/v2/screens/passage/TitleSheet.tsx` lines 48–57, test id `passage-classic` | The title sheet's bridge. The comment at lines 6–11 names verse mode, everyone's takes, resources, and Send |
| Observer | `src/routes/(app)/(stack)/observer-draft.tsx` re-exports `ObserverDraftScreen` | Read-only chapter. Home and the book page get here from `resolveChapterOpen` (`chapterOpen.ts` lines 77–102) |
| Recovery into classic | `resolveRecoveryHref` (`recoveryHref.ts` lines 22–88), launched from `src/routes/(app)/_layout.tsx` lines 46–57 | Legacy always opens drafting. Next opens the passage for a verse take in verse mode, or for a passage take whose saved verse is the first verse of that passage in this chapter (`passageSessionVerse`). It returns `verse-detail` when granularity is missing, `projectId` is null, route names are missing, a verse take is recorded while the unit is pericope, a passage take is opened in verse mode or a chapter with no pericopes, or a passage take was paused on a later verse. A missing marker or chapter returns null, so Resume does not navigate |
| Home and book version switch | `src/routes/(app)/(stack)/index.tsx` and `chapters.tsx` | `useUiVersion() === 'next'` picks `HomeScreen` / `BookScreen`; otherwise Legacy `HomeScreen` / `ViewProject` |

No required workflow in the tables below is "done" because that classic link exists. The link is the bridge until the named issue replaces it.

## Route map

Every file under `src/routes/` on `c1b3ac51`.

| Route file | Workflow | Next destination | Owner |
| --- | --- | --- | --- |
| `src/routes/index.tsx` | Session gate to login or home | Same redirect (`authGate`) | Retained. #917 keeps it |
| `src/routes/_layout.tsx` | Root, auth gate, upload-notification tap, launch entry | Same shell | Retained |
| `src/routes/gallery.tsx` | Dev component gallery | Not a user workflow | Stays behind `isComponentGalleryEnabled` |
| `src/routes/(auth)/_layout.tsx` | Signed-out stack | Same | Retained |
| `src/routes/(auth)/login.tsx` | Fresh login | `LoginScreen` | Retained |
| `src/routes/(auth)/forgot-password.tsx` | Reset from the signed-out screen | Same screen | Retained |
| `src/routes/(auth)/terms-of-use.tsx` | Legal before an account exists | Same | Retained |
| `src/routes/(auth)/privacy-policy.tsx` | Legal before an account exists | Same | Retained |
| `src/routes/(app)/_layout.tsx` | Drawer, accounts, resume prompt | Next uses the avatar sheet; drawer swipe stays off in Next | Retained shell. #917 |
| `src/routes/(app)/settings.tsx` | Settings | `SettingsScreen` | Retained until a Next settings issue exists. Not dropped |
| `src/routes/(app)/terms-of-use.tsx` | Legal while signed in | Same | Retained |
| `src/routes/(app)/privacy-policy.tsx` | Legal while signed in | Same | Retained |
| `src/routes/(app)/(stack)/_layout.tsx` | App stack | Same | Retained |
| `src/routes/(app)/(stack)/index.tsx` | Home | `src/app/v2/screens/HomeScreen.tsx` | #917 removes the `useUiVersion()` branch. #919 then deletes the unused Legacy module, after #915 and #917 |
| `src/routes/(app)/(stack)/chapters.tsx` | Book / chapter list | `src/app/v2/screens/BookScreen.tsx` | #917 removes the branch. #919 deletes the unused module after #915 and #917 |
| `src/routes/(app)/(stack)/passage.tsx` | Listen and record | `PassageScreen` only | Retained. Children fill the gaps below |
| `src/routes/(app)/(stack)/verse-detail.tsx` | Classic drafting | Passage, plus the child destinations | #920 deletes the route after #908–#918. #917 removes links first |
| `src/routes/(app)/(stack)/observer-draft.tsx` | Observer | Next read-only chapter | #913. Does not wait on #918 |
| `src/routes/(app)/(stack)/sync.tsx` | Sync | `SyncScreen` | Retained. Notification tap stays |
| `src/routes/(app)/(stack)/prepare-for-offline.tsx` | Downloads | `PrepareForOfflineScreen` | Retained |
| `src/routes/(app)/(stack)/reauth.tsx` | Re-authenticate | `LoginScreen` on this route | Retained |
| `src/routes/(app)/(stack)/add-user.tsx` | Add account | `LoginScreen` | Retained |
| `src/routes/(app)/(stack)/forgot-password.tsx` | Reset while signed in | Same | Retained |

## Workflows

Roles follow [roles and permissions](../../product-behavior/roles-and-permissions.md). The app does not store grants. Each child uses the server edit gate the Legacy screen already uses. "Retry" means the existing control that runs the action again after an error, not a new framework.

| Workflow | Who | Online / offline | Error / Retry | What must still be there | Next control | Owner | Evidence to collect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fresh login | Any account | Online for the password grant | Failed sign-in stays on login | Session token | `(auth)/login` | Retained | Existing login tests. Signed-out cold start is collected in #917, not in #915 |
| Restored session | Signed-in account | Offline uses the stored session | DB open failure does not show a signed-in shell | `AuthSessionProvider` restore | `/` redirect | Retained | Launch tests |
| Add account | Signed-in user adding another | Online | Failure does not switch the active account | Account list | `add-user` | Retained | Account-switch tests |
| Reauth | Expired session | Online | Hardware back leaves the screen without signing in: `navigateFromReauth` goes back, or replaces with Settings or Home | Same account | `reauth` | Retained | Reauth route tests |
| Switch and sign out | Signed-in user | Either | Sign-out clears the session | Active user id | Next avatar sheet; Legacy drawer | Retained | Drawer / accounts tests |
| Settings and legal | Signed-in and signed-out | Either | Legal pages open without a project | The four legal routes plus Settings | Those routes | Retained | Route render |
| Home and book | Drafter, peer, observer | Offline shows the last cache | Empty project is an empty list, not a crash | Chapter rows and stage labels | `HomeScreen`, `BookScreen` | #917 removes the Legacy branch in the route files. #919 deletes the unused modules after #915 and #917 | Home and book tests on `useUiVersion() === 'next'` |
| Claim and ownership | Translator vs assigned drafter vs peer | Claim is online | 404 does not assign locally | Assignment id | Book and Home taps via `resolveChapterOpen` / `resolveAssignmentOpen` | Retained (`chapterOpen.ts`) | `chapterOpen` tests |
| Verse recording | Drafter on an editable chapter | Capture is local; upload is sync | Mic denial explains itself | Take file and `recordings` row | Passage Record, verse mode | Passage already. Classic only for the gaps in this table | Passage record tests |
| Passage recording | Drafter | Same | Same | Range on the take | Passage Record, pericope mode | Same | Passage record tests |
| Interrupted capture | The account that started it | Offline | Resume cancelled leaves the marker. A missing marker or chapter does not navigate | `PausedTakeMarker`, including `capture` granularity and verse | Passage when `resolveRecoveryHref` returns `hrefs.passage`; otherwise not classic | #914 | `recoveryHref` tests for every `verse-detail` return: no granularity, null `projectId`, missing route names, verse take in pericope mode, passage take in verse mode or a chapter with no pericopes, passage take paused on a later verse |
| All-owner review | Someone allowed to see other owners' takes | Reads local rows; refresh is sync | Another account's official take is not taken over unseen | Owner id on the take | A Next review surface | #910 | A fixture with two owners on one unit |
| Source playback | Anyone who can open the passage | Prepared offline uses the downloaded file | Missing audio disables Play and keeps the verse label | Chapter file and `verseTimestamps` when present | Passage Listen | Retained | Passage listen tests. Timings: Q32 |
| Translation notes | Anyone who can open the passage | Offline uses the download | Empty and error states stay on the passage | Note ids | Passage Understanding | Retained if those states already exist. Not a classic-only workflow | Passage notes tests, including empty and error |
| Translation questions | Same | Offline after prepare | Retry re-fetches; empty is not an error | Question ids | New passage resources surface | #911 | Offline open, failed fetch, Retry |
| Images and maps | Same | Offline after prepare | Retry; empty is empty | Resource ids | New passage resources surface | #912 | Offline open, failed fetch, Retry |
| Observer | Observer grant plus project membership | Offline uses the last bundle | Grant loss does not open the editor | Read-only chapter | Next read-only chapter, not `observer-draft` | #913. Theme stays the current Next theme API | `chapterOpen` observer branch, then a Next screen test. No #918 dependency |
| Send to peer check | Drafter with recordings | Online to confirm; queue offline | Retry the queued advance; rejection stays in draft | Stage queue row | Next Send | #908 | Queue then server `peer_check` |
| Later stages through Complete | The role that stage allows | Server must confirm Complete | A rejected advance does not paint Complete | Stage and server status | Next stage control | #909 | One step per stage from `peer_check` through `complete`, with a failed confirm |
| Sync | Signed-in user | Online | Sync error stays on Sync with a way to run it again | Sync timestamps | `sync` | Retained | Sync screen tests |
| Prepare for offline | Signed-in user | Online to download | Failed download can be retried | Downloaded files | `prepare-for-offline` | Retained | Prepare tests |
| Upload notification | Signed-in user | Either | A tap with no session waits until login | Notification id | `useUploadSyncNotificationTap` → Sync | Retained | Notification tap test |

Every `verse-detail` return from `resolveRecoveryHref` is #914, including a passage take when the unit is in verse mode or the chapter has no pericopes (`recoveryHref.ts` line 82), a null `projectId` (line 50), and missing route names (line 65). Capture-less markers are `granularity === undefined` (lines 47–52). Mismatched anchors are `sessionVerse !== verseNumber` (lines 86–88). They are not waived.

## Dependency order

No step waits on a later step.

1. #907 is this checklist. It does not wait for implementations.
2. #908, #909, #910, #911, #912, #913, and #914 may start once this checklist is accepted. They do not wait on each other.
3. #915 starts after #908–#914 and proves those Next journeys. It can close before #916 and #917. It does not require #917 to be closed.
4. #916 migrates saved Legacy UI choices only after #915.
5. #917 then points startup and existing links at Next only, and removes the Legacy branch from the home and book route files.
6. #918 then removes the second theme system. #913 does not wait for it.
7. #919 deletes the Legacy Home and book modules only after #915 and #917 have made them unreachable. #920 deletes classic drafting after #908–#918.

#894 signoff, later, needs all of: the workflows above working at runtime, old markers recovered without classic, #915 journeys migrated, one theme system, and no reachable Legacy or classic screen. A disabled control or a green CI run is not that signoff.

## Nothing omitted

No supported behavior is dropped behind a redirect. Where Next is missing a workflow, the table names the issue that adds it. Settings has no Next redesign ticket; it stays on `SettingsScreen` until one exists.

## What stays after the screens go

These are not presentation. Retirement must not delete them:

- Auth and launch: `AuthSessionProvider`, `authGate`, `useLaunchEntry`
- Recording: `useRecordSession`, `useVerseAudio`, paused-take recovery
- Listen: `useSourceAudio`
- Observer grants and bundles: `userOrgGrants`, observer draft destination helpers
- Stages: stage policy and `stage_advance_queue`
- Sync, upload, and downloads
- SQLite via `src/db/`

Classic-only types that have to move before `verse-detail` and `observer-draft` are deleted: the verse-detail search params (`recoverSessionKey`, `recoverVerse` in `hrefs.verseDetail`), and the observer-draft href from `getObserverDraftDestination`. #914 and #913 own the new destinations. #917 may keep an old-URL adapter if a saved link still needs one. #920 removes the verse-detail route and those params when it deletes classic drafting.
