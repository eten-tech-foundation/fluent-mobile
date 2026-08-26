# Multi-account nightly QA script (shared device)

Repeatable **post-merge nightly** checklist for proving multi-account isolation on one Android device. Use after account-switcher, session, or sync changes that touch user-scoped data.

**Install / nightly path:** [qa-preview-testing.md](qa-preview-testing.md)  
**When QA runs / board handoff:** [qa-process.md](qa-process.md)

## When to run

- PRs marked **Needs QA? Yes** that change account switcher, session storage, sync scoping, or settings
- Regression pass before release when multi-account behavior is in scope
- Issue **#375** baseline run (record results on that issue)

## Prerequisites

| Item | Notes |
| --- | --- |
| **Build** | Latest **nightly** Fluent APK from `main` (not Expo Go, not Metro) |
| **Accounts** | Two distinct Fluent users with credentials (different emails) |
| **Data** | Each account should have at least one project with chapter assignments (sync once per account while active) |
| **Device** | One physical Android phone (shared-device matrix) |

Optional third account if testing the device limit (`MAX_DEVICE_ACCOUNTS` = 3).

## Setup (once per run)

1. Install the nightly APK ([qa-preview-testing.md](qa-preview-testing.md)).
2. Sign in as **Account A**. On **Home**, tap the **sync icon** in the header → **Sync** screen → run sync and wait for success.
3. Note one chapter you can open on Account A (project + chapter for recording checks below).
4. Open the **drawer** (gear menu) → **Add User** → sign in as **Account B** (or use **Settings → Account → Add user**).
5. While **Account B** is active, run sync from the Home header sync icon and note a chapter distinct from Account A’s.

Record build id / nightly comment URL at the top of your results (see template below).

---

## Checklist

Mark each row **Pass** / **Fail** / **N/A**. File a **new bug issue** for every Fail — do not waive silently.

### A. Add and list accounts

| # | Step | Expected | Pass? |
| --- | --- | --- | --- |
| A1 | Open drawer (gear) → **Accounts** | Lists Account A and Account B; active row shows checkmark / focused state | |
| A2 | Drawer → **Add User** (or Settings → Account → **Add user**) | Navigates to add-user sign-in; after sign-in, both accounts appear in the drawer list | |
| A3 | Account limit (optional) | With three accounts stored, add flow reflects limit (no fourth slot) | |

### B. Switch accounts (UI + navigation)

| # | Step | Expected | Pass? |
| --- | --- | --- | --- |
| B1 | Switch A → B from drawer **Accounts** | Lands on Home; no white screen or crash | |
| B2 | Open **Settings** on Account B | Settings renders (header, preferences, account rows) — no red screen | |
| B3 | Switch B → A | Home loads; switcher shows A as active | |
| B4 | Open **Settings** on Account A | Same as B2 | |

### C. No cross-account data leakage

Perform these checks **after** switching — data must match the **active** account only.

| # | Step | Expected | Pass? |
| --- | --- | --- | --- |
| C1 | **My Work** (or project chapter list) | Shows chapters assigned to the active user only; switching users changes the list | |
| C2 | Open a chapter → **Record** tab (drafting) for a chapter owned by active user | Verse list loads; no other user’s in-progress take appears as yours | |
| C3 | Switch to the other account and repeat C1–C2 | Previous account’s assignments do not appear while the other user is active | |

### D. Sync scoped to active user

| # | Step | Expected | Pass? |
| --- | --- | --- | --- |
| D1 | On Account A, Home header **sync icon** → Sync → trigger sync | Completes without auth errors; last-sync indicator updates | |
| D2 | Switch to Account B, repeat from Home header sync icon | Completes; does not revert A’s UI or show A’s email as active | |
| D3 | Switch back to A | Projects/chapters still present for A (offline data retained per account) | |

### E. Sign-out / session edge (optional)

| # | Step | Expected | Pass? |
| --- | --- | --- | --- |
| E1 | Sign out current account when another account remains | App switches to another stored account **or** clean sign-out — no crash | |

---

## Pass / fail

- **Pass:** All required rows (A1–A2, B1–B4, C1–C3, D1–D3) are Pass.
- **Fail:** Any required row Fail → open a bug issue with repro steps, nightly build link, and account roles (A/B). Move feature card per [qa-process.md](qa-process.md).

Known historical blocker: settings white screen on switch ([#348](https://github.com/eten-tech-foundation/fluent-mobile/issues/348)) — if still failing on your nightly, note build date; fix may land via a merged PR before your run.

---

## Record results on GitHub

Paste this block on issue **#375** (or the feature issue under test) after one full run:

```markdown
## Multi-account nightly run

- **Date:**
- **Tester:**
- **Nightly / build:** (link to install comment or EAS build id)
- **Account A:** (email prefix or id — no passwords)
- **Account B:**

| Section | Result |
| --- | --- |
| A Add/list | Pass / Fail |
| B Switch + Settings | Pass / Fail |
| C Isolation | Pass / Fail |
| D Sync scope | Pass / Fail |
| E Sign-out (optional) | Pass / Fail / N/A |

**Notes / bugs filed:** (links to new issues if any)
```

---

## Related

- Account switcher UI: drawer **Accounts** (`UserSettingsMenu`), drafting modal (`AccountSwitcherPanel` — **Add Account**)
- Session: `accountSession.ts`, `src/navigation/AuthSessionProvider.tsx`
- Issue **#375** — checklist source ticket
- Issue **#291** — offline auth durability (out of scope for this script)
