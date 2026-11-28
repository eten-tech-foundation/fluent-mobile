# Workflow parity and retirement checklist

Route and workflow map for the Next app. Written for #907 and reconciled to
the implementation after #916–#920. Not a runtime change. Part of #894.
#894 signoff is separate and is not this document.

The nightly Android checks for these workflows are in
[qa-process.md](../../guides/qa-process.md#next-nightly-scenarios). A green CI
run, and the absence of the old filenames, are not that pass.

## Where the workflows go

#919 removed the Legacy Home and book screens. #920 removed classic drafting.
`verse-detail` stays as an adapter: a saved recovery link opens the Next
passage with `recoverSessionKey` and `recoverVerse`; any other chapter link
opens Next (the Observer screen when this account may only observe, otherwise
the passage at verse 1). A chapter whose project cannot be read does not open
the editor. The title sheet, notices, gallery, and recovery do not render
classic drafting. Details: [Next UI](README.md#saved-links-and-recovery).

| Entry | Where | What it does |
| --- | --- | --- |
| Classic drafting | Removed in #920. `verse-detail` redirects to Next | Send, resources, all-owner review, and recovery are on the passage |
| Open in classic drafting | Removed in #920. No `passage-classic` row | Resources, questions, review, and Send stay on the passage |
| Observer | `observer-draft.tsx` renders `ObserverScreen` only | Read-only chapter. Home and the book page get here from `resolveChapterOpen` |
| Recovery | `resolveRecoveryHref` opens the passage with the saved key and verse | Resume does not open classic drafting. `missing` or `unread` leaves the launch alert on Retry or Discard |
| Home and book | `HomeScreen` / `BookScreen` only (#919) | No version switch |

## Route map

Routes under `src/routes/` after #920. Line numbers in the original #907
draft were from `c1b3ac51` and are not repeated here.

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
| `src/routes/(app)/_layout.tsx` | Drawer group, accounts, resume prompt | Accounts open from the avatar sheet. Drawer swipe stays off | Retained shell. #917 |
| `src/routes/(app)/settings.tsx` | Settings | `SettingsScreen` | Retained until a Next settings issue exists. Not dropped |
| `src/routes/(app)/terms-of-use.tsx` | Legal while signed in | Same | Retained |
| `src/routes/(app)/privacy-policy.tsx` | Legal while signed in | Same | Retained |
| `src/routes/(app)/(stack)/_layout.tsx` | App stack | Same | Retained |
| `src/routes/(app)/(stack)/index.tsx` | Home | `src/app/v2/screens/HomeScreen.tsx` | #917 removed the version branch. #919 deleted the unused Home module |
| `src/routes/(app)/(stack)/chapters.tsx` | Book / chapter list | `src/app/v2/screens/BookScreen.tsx` | #917 removed the branch. #919 deleted the unused module |
| `src/routes/(app)/(stack)/passage.tsx` | Listen and record | `PassageScreen` only | Listen, Record, Send, resources, and recovery |
| `src/routes/(app)/(stack)/verse-detail.tsx` | Old verse-detail URLs | Next passage, or Next Observer for a read-only account. Recovery parameters stay on the passage | #920 keeps this adapter and deletes classic drafting |
| `src/routes/(app)/(stack)/observer-draft.tsx` | Observer | Next read-only chapter | #913. `ObserverScreen` only |
| `src/routes/(app)/(stack)/sync.tsx` | Sync | `SyncScreen` | Retained. Notification tap stays |
| `src/routes/(app)/(stack)/prepare-for-offline.tsx` | Downloads | `PrepareForOfflineScreen` | Retained |
| `src/routes/(app)/(stack)/reauth.tsx` | Re-authenticate | `LoginScreen` on this route | Retained |
| `src/routes/(app)/(stack)/add-user.tsx` | Add account | `LoginScreen` | Retained |
| `src/routes/(app)/(stack)/forgot-password.tsx` | Reset while signed in | Same | Retained |

## Workflows

Roles follow [roles and permissions](../../product-behavior/roles-and-permissions.md). The app does not store grants. Each workflow uses the server edit gate in `chapterOpen` and the stage policy. "Retry" means the existing control that runs the action again after an error.

| Workflow | Who | Online / offline | Error / Retry | What must still be there | Next control | Owner | Evidence to collect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fresh login | Any account | Online for the password grant | Failed sign-in stays on login | Session token | `(auth)/login` | Retained | Existing login tests. Signed-out cold start is collected in #917, not in #915 |
| Restored session | Signed-in account | Offline uses the stored session | DB open failure does not show a signed-in shell | `AuthSessionProvider` restore | `/` redirect | Retained | Launch tests |
| Add account | Signed-in user adding another | Online | Failure does not switch the active account | Account list | `add-user` | Retained | Account-switch tests |
| Reauth | Expired session | Online | Hardware back leaves the screen without signing in: `navigateFromReauth` goes back, or replaces with Settings or Home | Same account | `reauth` | Retained | Reauth route tests |
| Switch and sign out | Signed-in user | Either | Sign-out clears the session | Active user id | Home avatar → Accounts sheet (Add account, Settings, Log out) | Retained | Drawer / accounts tests |
| Settings and legal | Signed-in and signed-out | Either | Legal pages open without a project | The four legal routes plus Settings | Those routes. Settings has no UI version row | Retained | Route render |
| Home and book | Drafter, peer, observer | Offline shows the last cache | Empty project is an empty list, not a crash | Chapter rows and stage labels | `HomeScreen`, `BookScreen` | #917 and #919 | Home and book tests |
| Claim and ownership | Translator vs assigned drafter vs peer | Claim is online | 404 does not assign locally | Assignment id | Book and Home taps via `resolveChapterOpen` / `resolveAssignmentOpen` | Retained (`chapterOpen.ts`) | `chapterOpen` tests |
| Verse recording | Drafter on an editable chapter | Capture is local; upload is sync | Mic denial explains itself | Take file and `recordings` row | Passage Record, verse mode | Passage | Passage record tests |
| Passage recording | Drafter | Same | Same | Range on the take | Passage Record, pericope mode | Passage | Passage record tests |
| Interrupted capture | The account that started it (`userId` on the marker; older markers are anyone's) | Offline | Resume cancelled leaves the marker. A missing marker or chapter, or unreadable names, offers Retry or Discard | `PausedTakeMarker`, including `capture` granularity and verse | Passage, in the saved unit and keyed on the saved verse (Q33) | Done in #914 | `recoveryHref.test.ts` and `recoveryHref.session.test.tsx`: verse, passage, no-pericope and capture-less fixtures, both settings, a later passage anchor, failed then successful names, failed Finish, another account. `PassageScreen.test.tsx` "opened to recover a paused take" |
| All-owner review | Someone allowed to see other owners' takes | Reads local rows; refresh is sync | Another account's official take is not taken over unseen | Owner id on the take | Title sheet → Everyone's takes | #910 | A fixture with two owners on one unit |
| Source playback | Anyone who can open the passage | Prepared offline uses the downloaded file | Missing audio disables Play and keeps the verse label | Chapter file and `verseTimestamps` when present | Passage Listen | Retained | Passage listen tests. Timings: Q32 |
| Translation notes | Anyone who can open the passage | Offline uses the download | Empty and error states stay on the passage | Note ids | Passage script → Understanding | Retained | Passage notes tests, including empty and error |
| Translation questions | Same | Offline after prepare | Retry re-fetches; empty is not an error | Question ids | Title sheet → Translation Questions | #911 | Offline open, failed fetch, Retry |
| Images and maps | Same | Offline after prepare | Retry; empty is empty | Resource ids | Resources card → Images and maps | #912 | Offline open, failed fetch, Retry |
| Observer | Observer grant plus project membership | Offline uses the last bundle | Grant loss does not open the editor | Read-only chapter | `ObserverScreen` at `observer-draft` | #913 | `chapterOpen` observer branch and the Observer screen test |
| Send to peer check | Drafter with recordings | Online to confirm; queue offline | Retry the queued advance; rejection stays in draft | Stage queue row | Title sheet Send (`passage-send`) | #908 | Queue then server `peer_check` |
| Later stages through Complete | The role that stage allows | Server must confirm Complete | A rejected advance does not paint Complete | Stage and server status | Title sheet Send, labeled for that stage | #909 | One step per stage from `peer_check` through `complete`, with a failed confirm |
| Sync | Signed-in user | Online | Sync error stays on Sync with a way to run it again | Sync timestamps | `sync` | Retained | Sync screen tests |
| Prepare for offline | Signed-in user | Online to download | Failed download can be retried | Downloaded files | `prepare-for-offline` | Retained | Prepare tests |
| Upload notification | Signed-in user | Either | A tap with no session waits until login | Notification id | `useUploadSyncNotificationTap` → Sync | Retained | Notification tap test |

`resolveRecoveryHref` returns the passage, never `verse-detail` (#914). An old `verse-detail` recovery URL is adapted onto that same passage (#917, #920).

## Dependency order

This is how #908–#920 were sequenced. Those steps are in the branch history.
#894 signoff is still separate. A disabled control or a green CI run is not
that signoff.

1. #907 is this checklist.
2. #908, #909, #910, #911, #912, #913, and #914 implement the passage workflows.
3. #915 proves those journeys and can close before #916 and #917.
4. #916 migrates saved UI choices.
5. #917 points startup and existing links at Next only.
6. #918 removes the second theme system.
7. #919 deletes the retired Home and book modules. #920 deletes classic drafting. The nightly scenarios in [qa-process.md](../../guides/qa-process.md#next-nightly-scenarios) are the device evidence.

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

`verse-detail` stays so a saved link still resolves. Recovery params (`recoverSessionKey`, `recoverVerse`) are copied onto `hrefs.passage`. A chapter link with no recovery does not carry them. #913 kept `observer-draft` and `getObserverDraftDestination` as the Next Observer destination. Shared recording, playback, sync and database code stay.
