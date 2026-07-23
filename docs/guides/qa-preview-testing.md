# How to test a Fluent Mobile PR preview (Android)

Plain-language guide for QA and reviewers. **No developer tools** — just an Android phone and the GitHub PR comment.

## Quick start (2 steps)

Every preview PR comment from GitHub Actions has **two steps**. Use them in order:

| Step | What to do | Link in PR comment |
|------|------------|-------------------|
| **1** | Install **Fluent** on your phone (one-time per app version) | **Install Fluent** |
| **2** | Open **Fluent** from your home screen to load the preview | _(no link — open the app)_ |

**Do not use Expo Go** from the Play Store — it will not work.

The preview app is an **internal APK** (like a pre-release build). It is **not** a developer build that connects to Metro or localhost.

---

## Step 1 — Install Fluent (first time only)

Skip this if **Fluent** is already on your phone and previews have worked before.

1. On your **Android phone**, open the pull request on GitHub.
2. Find the bot comment (starts with **“Test this PR on your Android phone”** or **“Fluent preview app ready”**).
3. Tap **Install Fluent** (or scan the install QR code on native-preview comments).
4. Sign in to [expo.dev](https://expo.dev) if asked — ask your team lead for an invite if needed.
5. Tap **Download** or **Install** on the build page.
6. If Android blocks the install:
   - **Settings → Security** (or **Install unknown apps**)
   - Allow your **browser** or **Files** app to install APKs
7. Open **Fluent** from your home screen.
8. The app should open normally (sign-in / home) — **not** a Metro dev launcher and **not** Expo Go.

**First preview on a new version?** The workflow may build this install app for you automatically (~15 minutes). Refresh the PR comment when GitHub Actions finishes.

---

## Step 2 — Open this PR’s preview

1. Open **Fluent** from your home screen (use Wi‑Fi if possible).
2. Wait for the preview update to download (often under a minute after Step 1).
3. Sign in and test the PR.

If the app looks unchanged:

1. Fully close Fluent (swipe it away from recent apps).
2. Reopen Fluent and wait on the home/splash screen.

---

## Important: Fluent is not Expo Go

| App | Works? |
|-----|--------|
| **Fluent** (from **Install Fluent** link in PR) | ✅ Yes |
| **Expo Go** (Play Store) | ❌ No |

---

## Two kinds of preview comments

### 📲 “Test this PR on your Android phone” (most PRs)

- **Step 1** installs the Fluent preview app (or reuses an existing install).
- **Step 2** opens Fluent — the app pulls a small over-the-air (OTA) update from the `preview` channel.
- Usually ready in a few minutes (longer the very first time if the install app had to be built).

### ✅ “Fluent preview app ready” (native changes)

- The PR changed something that needs a **new full app install**.
- Use the **Install Fluent** link (or QR) in that comment.
- Open Fluent and test — the APK already includes this PR’s native changes.
- Later **JS-only** PRs can use OTA again until the app version changes.

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| I don’t have Fluent yet | Use **Step 1 — Install Fluent** in the PR comment first. |
| App shows Metro / localhost / dev launcher | Wrong build type installed. Reinstall from the latest **Install Fluent** link on the PR (old dev-client APK). |
| Phone offers **Expo Go** | Cancel. Install **Fluent** from the **Install Fluent** link. |
| “Unable to load update” | Your Fluent app may be the wrong version. Tap **Install Fluent** in the comment again (or wait for a **native preview** comment on the PR). |
| Install blocked | Allow **Install unknown apps** for your browser (Step 1). |
| No bot comment on PR | Ask a developer to add the **`preview-build`** label. |
| expo.dev asks me to log in | Request access to the Fluent project from your team lead. |

---

## For developers

1. Add the **`preview-build`** label to the PR.
2. Share this guide with QA: `docs/guides/qa-preview-testing.md`
3. Preview APKs use the EAS `preview` profile (internal distribution, `preview` channel — **not** `developmentClient`).

### Nightly builds (optional)

Separate from PR previews: GitHub Actions can publish a **nightly Android APK** (EAS profile `nightly`, development API). Install from the Slack message or the Actions job summary — **not** from a PR comment. Nightlies are **binary only** (no over-the-air update). See [`.github/README.md`](../../.github/README.md).

Technical details: [`.github/README.md`](../../.github/README.md) · [`.eas/README.md`](../../.eas/README.md)
