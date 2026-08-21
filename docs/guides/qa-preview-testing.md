# How to test Fluent Mobile builds (Android)

Plain-language guide for QA and reviewers. **No developer tools** — just an Android phone and GitHub / Slack.

**Process / board handoff (when QA is required, who owns what):** [qa-process.md](qa-process.md). This page is **how to install and test** an APK.

**Default for QA:** install the **nightly** Fluent APK (main). Isolated PR `preview-build` APKs are **optional** for developers debugging a branch — they do not start the QA queue.

## Quick start (QA — nightly)

1. Open the **nightly** install comment on the **GitHub issue** (bot posts after a successful Nightly Preview), **or** use the Slack nightly notice.
2. Tap **Install Fluent nightly** (or scan the QR code).
3. Open **Fluent** from your home screen and test the ticket’s acceptance criteria.
4. **Pass:** move Project 4 → **Passed QA** and leave a short comment.
5. **Fail:** open a **new** bug issue (the feature is already on `main`).

**Do not use Expo Go** from the Play Store — it will not work.

Nightlies are a **standalone internal APK** for `main` (no over-the-air update). On one phone you can only have one Fluent install — reinstall when switching between nightly and an optional PR preview.

---

## Install Fluent (nightly)

1. On your **Android phone**, open the linked **issue** on GitHub (or Slack nightly message).
2. Find the bot comment (**“Nightly APK ready for QA”**) or Slack install link.
3. Tap **Install Fluent nightly** (or scan the install QR code).
4. Sign in to [expo.dev](https://expo.dev) if asked — ask your team lead for an invite if needed.
5. Tap **Download** or **Install** on the build page.
6. If Android blocks the install:
   - **Settings → Security** (or **Install unknown apps**)
   - Allow your **browser** or **Files** app to install APKs
7. Open **Fluent** from your home screen.
8. The app should open normally (sign-in / home) — **not** a Metro dev launcher and **not** Expo Go.
9. Sign in and test.

Scheduled nightlies run ~**06:00 UTC**. If nothing new landed on `main`, the nightly may skip a build — wait for the next run that includes your merge.

If the app looks wrong after installing a different APK:

1. Uninstall Fluent (or install over it from the new install link).
2. Fully close Fluent (swipe it away from recent apps) and reopen.

---

## Important: Fluent is not Expo Go

| App | Works? |
|-----|--------|
| **Fluent** (from **Install Fluent** / nightly link) | Yes |
| **Expo Go** (Play Store) | No |

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| I don’t have Fluent yet | Tap **Install Fluent nightly** in the issue bot comment or Slack. |
| App shows Metro / localhost / dev launcher | Wrong build type. Reinstall from the latest nightly (or PR preview) link. |
| Phone offers **Expo Go** | Cancel. Install **Fluent** from the install link. |
| Testing the wrong build | Install again from the latest nightly comment for that issue. |
| Install blocked | Allow **Install unknown apps** for your browser. |
| No handoff / nightly comment on the issue | Confirm the PR had **Needs QA? Yes** and `Refs #NNN`, then ask a developer to check `qa-handoff` / nightly Actions. |
| expo.dev asks me to log in | Request access to the Fluent project from your team lead. |

---

## For developers

Full process (Needs QA?, post-merge handoff, pass/fail): **[qa-process.md](qa-process.md)**.

1. Link the ticket in the PR body (`Refs #NNN` on its own Details line — never `Closes` / `Fixes` / `Resolves`; do not use `Part of #NNN` for the ticket you want QA handoff for).
2. Check **Needs QA? Yes** when device QA is required.
3. After merge, [`qa-handoff.yml`](../../.github/workflows/qa-handoff.yml) comments on the issue, adds `@Roslin22`, and moves Project 4 → **In QA**.
4. Nightly [`nightly-preview.yml`](../../.github/workflows/nightly-preview.yml) posts the install URL on recent handoff issues.
5. Optional: add **`preview-build`** for an isolated PR APK (**PR comment only** — does not start QA). Re-request: remove and re-add the label.
6. Preview / nightly APKs use EAS profiles with Updates disabled (binary only — **not** `developmentClient`).

### Nightly builds

See [`.github/README.md`](../../.github/README.md) and [qa-process.md](qa-process.md).
