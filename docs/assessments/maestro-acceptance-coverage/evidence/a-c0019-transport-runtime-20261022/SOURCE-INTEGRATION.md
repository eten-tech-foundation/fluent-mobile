# A transport-fixture live 7-file copy result

**Action:** mechanical copy of **only** 7 approved runtime files  
**Source:** `/Users/matt/Documents/Codex/2026-10-19/task-10/worktrees/a-audit-fault-fixture-proposal`  
**Destination:** `/Users/matt/Documents/Development/gloo/fluent-mobile`  
**Backup (preserved, not rewritten):** `/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/a-fault-runtime-20261022/source-backup`  
**Not done:** tests/docs copy, code edits, Jest, npx/npm, config, publication, device/Metro, commit/push, AI co-author

## Pre-copy gate (required)

Live tree verified **before** copy:

| Check | Result |
|---|---|
| 4 original files match `pre-copy-manifest.sha256` | OK |
| 3 new modules absent (`devMetadataSyncControl`, `devMetadataSyncFault`, `devSourceAudioFault`) | OK |
| Existing source-backup intact | OK |

Pre-copy original 4 SHAs (live = manifest):

| Path | SHA256 |
|---|---|
| `src/app/screens/SyncScreen.tsx` | `1f252992c6a81506ae7ba79e48605f263481692744f73259b26ba9cd4ba575b1` |
| `src/services/sync.ts` | `8a708648da97539efa0ce5fb58f2eab59054d85795f8601fae8a17d8693215bd` |
| `src/hooks/useSourceAudio.ts` | `303a157e527e7adc70afb387a02a9377011fc32f7eda83482738c4f4a570ae92` |
| `src/navigation/AuthSessionProvider.tsx` | `43082ce5d709fee1da72e2b38741e75c39a51c81bbf0e59e32298f6d45bb87a5` |

## Copied 7 — source = destination SHA256

| Path | SHA256 (isolated SRC = live DEST) |
|---|---|
| `src/app/screens/SyncScreen.tsx` | `c845463592c6b74ad32d45bb3025257f2fae0dac0500fe4aa92732c00beae57d` |
| `src/services/sync.ts` | `e78b64b6b9a6a83969ae86837c9285bb3fe662ba8da4c252b825daa84d6e7588` |
| `src/services/devMetadataSyncControl.ts` | `6bc688ab86a33b2a3f8ed0dbb543bcf7e1b4bcd2b7daddaf80d36bf168d6e4e8` |
| `src/services/devMetadataSyncFault.ts` | `249ed05d747bf28fb5ff8339472a89d522a9744a3c7a49a567cdb3273ec8fe07` |
| `src/services/devSourceAudioFault.ts` | `c98c369a68bc1f42acfa946a7b8e9bf9f6fa616659ede2082861e336af325a41` |
| `src/hooks/useSourceAudio.ts` | `432c6a773bf51e7847edfeb2c0e923ecdd56ceb55b93b8ec145f064387876069` |
| `src/navigation/AuthSessionProvider.tsx` | `a384c1bee6b43f6709bca97ba64cc95e09088d3679996741f26cb737e56b7047` |

Includes reviewed `projects_transport` delta in `devMetadataSyncFault.ts` + `sync.ts` (production classification path).

## Preserved original baseline backup

Backup directory **not modified**. Original restore bytes still match pre-copy manifest:

| Backup bytes path | SHA256 |
|---|---|
| `bytes/src/app/screens/SyncScreen.tsx` | `1f252992c6a81506ae7ba79e48605f263481692744f73259b26ba9cd4ba575b1` |
| `bytes/src/services/sync.ts` | `8a708648da97539efa0ce5fb58f2eab59054d85795f8601fae8a17d8693215bd` |
| `bytes/src/hooks/useSourceAudio.ts` | `303a157e527e7adc70afb387a02a9377011fc32f7eda83482738c4f4a570ae92` |
| `bytes/src/navigation/AuthSessionProvider.tsx` | `43082ce5d709fee1da72e2b38741e75c39a51c81bbf0e59e32298f6d45bb87a5` |

Manifest / marker hashes (untouched):

| Artifact | SHA256 |
|---|---|
| `pre-copy-manifest.sha256` | `2236f1da24f8bf6963a226e569117c3d0936800af24aa344a785c66235bea760` |
| `post-copy-manifest.sha256` | `24db4e7552125a65ff66d9879fde755d9841f102b3c2de65426f2caff8c21adc` |
| `sha-match-report.txt` | `abbc720b0ef247230c5ec41410b61d1132bafab89383961ea04cf79fcf389771` |
| `created-files-for-later-removal.txt` | `524a763eaca4d33094d48beeced61aa30c4147817019b92c5310d7237ce84748` |
| `README.txt` | `460f6c47d63f1c6ab513524e9adaba24ed98f175541ffd7c02b3fe53cb6a6642` |

`.ABSENT` markers for the 3 created modules remain under `bytes/src/services/`.

## Scope note

Root owns app/server. This job: file copy + receipt only. `ALL_OK=1`.
