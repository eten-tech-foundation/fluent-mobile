# How to test a Fluent Mobile PR preview (Android)

Plain-language guide for QA and reviewers. **No developer tools** — just an Android phone and the GitHub **PR or issue** comment.

## Quick start

1. Open the bot comment on the **pull request** or the **linked GitHub issue**.
2. Tap **Install Fluent** (or scan the QR code).
3. Open **Fluent** from your home screen and test.

**Do not use Expo Go** from the Play Store — it will not work.

The preview is a **standalone internal APK** for that PR (no over-the-air update). Each labeled PR gets its own build so multiple QA previews can exist at once. On one phone you can only have one Fluent install — reinstall when switching PRs.

When the preview is ready, the ticket usually moves to **In QA** on the Fluent Mobile Board.

---

## Install Fluent

1. On your **Android phone**, open the pull request **or** the linked issue on GitHub.
2. Find the bot comment (starts with **“Fluent preview app ready”**).
3. Tap **Install Fluent** (or scan the install QR code).
4. Sign in to [expo.dev](https://expo.dev) if asked — ask your team lead for an invite if needed.
5. Tap **Download** or **Install** on the build page.
6. If Android blocks the install:
   - **Settings → Security** (or **Install unknown apps**)
   - Allow your **browser** or **Files** app to install APKs
7. Open **Fluent** from your home screen.
8. The app should open normally (sign-in / home) — **not** a Metro dev launcher and **not** Expo Go.
9. Sign in and test the PR.

Builds often take ~10–15 minutes. Refresh the bot comment when GitHub Actions finishes.

If the app looks wrong after installing a different PR’s preview:

1. Uninstall Fluent (or install over it from the new **Install Fluent** link).
2. Fully close Fluent (swipe it away from recent apps) and reopen.

---

## Important: Fluent is not Expo Go

| App | Works? |
|-----|--------|
| **Fluent** (from **Install Fluent** link) | ✅ Yes |
| **Expo Go** (Play Store) | ❌ No |

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| I don’t have Fluent yet | Tap **Install Fluent** in the bot comment. |
| App shows Metro / localhost / dev launcher | Wrong build type. Reinstall from the latest **Install Fluent** link (old dev-client APK). |
| Phone offers **Expo Go** | Cancel. Install **Fluent** from the **Install Fluent** link. |
| Testing the wrong PR | Install again from that PR’s (or issue’s) latest bot comment. |
| Install blocked | Allow **Install unknown apps** for your browser. |
| No bot comment on PR or issue | Ask a developer to add the **`preview-build`** label (and ensure the PR has `Closes #NNN`). |
| expo.dev asks me to log in | Request access to the Fluent project from your team lead. |

---

## For developers

1. Link the ticket in the PR body (`Closes #NNN`).
2. Add the **`preview-build`** label to the PR.
3. Workflow starts a **fresh Android preview APK** (binary only — no OTA), comments on the **PR and linked issue**, and moves the ticket to **In QA** when Status was `In PR Review` or `In Progress (Dev)`.
4. Share this guide with QA: `docs/guides/qa-preview-testing.md`
5. Preview APKs use the EAS `preview` profile (internal distribution, Updates disabled — **not** `developmentClient`).
6. Optional repo secret `PROJECT_BOARD_TOKEN` enables Project 4 Status updates (issue comments work without it).

### Nightly builds (optional)

Separate from PR previews: GitHub Actions can publish a **nightly Android APK** (EAS profile `nightly`, development API). Install from the Slack message or the Actions job summary — **not** from a PR comment. Nightlies are **binary only**. See [`.github/README.md`](../../.github/README.md).

Technical details: [`.github/README.md`](../../.github/README.md) · [`.eas/README.md`](../../.eas/README.md)
