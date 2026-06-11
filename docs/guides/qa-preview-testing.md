# How to test a Fluent Mobile PR preview (Android)

Plain-language guide for QA and reviewers. **No developer tools** — just an Android phone and the GitHub PR comment.

## Quick start (2 steps)

Every preview PR comment from GitHub Actions has **two big links**. Use them in order:

| Step | What to do | Link in PR comment |
|------|------------|-------------------|
| **1** | Install **Fluent** on your phone (one-time per app version) | **Install Fluent** |
| **2** | Load **this PR’s preview** | **Open this preview in Fluent** |

**Do not use Expo Go** from the Play Store — it will not work.

---

## Step 1 — Install Fluent (first time only)

Skip this if **Fluent** is already on your phone and previews have worked before.

1. On your **Android phone**, open the pull request on GitHub.
2. Find the bot comment (starts with **“Test this PR on your Android phone”**).
3. Tap **Install Fluent**.
4. Sign in to [expo.dev](https://expo.dev) if asked — ask your team lead for an invite if needed.
5. Tap **Download** or **Install** on the build page.
6. If Android blocks the install:
   - **Settings → Security** (or **Install unknown apps**)
   - Allow your **browser** or **Files** app to install APKs
7. Open **Fluent** from your home screen.
8. You should see a **development / project** screen — **not** the orange **Expo Go** app.

**First preview on a new version?** The workflow may build this install app for you automatically (~15 minutes). Refresh the PR comment when GitHub Actions finishes.

---

## Step 2 — Load this PR’s preview

1. On your **Android phone**, open the same PR comment.
2. Tap **Open this preview in Fluent**.
3. If Android asks which app to use, pick **Fluent** — **not** Expo Go.
4. Wait for the update to download (Wi‑Fi helps).
5. Sign in and test the PR.

**Or scan the QR code** in the comment (only after Step 1):

- Open **Fluent → Scan QR code**, or
- Use your phone **Camera** on the QR image → tap **Open in Fluent**

---

## Important: Fluent is not Expo Go

| App | Works? |
|-----|--------|
| **Fluent** (from **Install Fluent** link in PR) | ✅ Yes |
| **Expo Go** (Play Store) | ❌ No |

---

## Two kinds of preview comments

### 📲 “Test this PR on your Android phone” (most PRs)

- **Step 1** installs Fluent (or reuses an existing install app).
- **Step 2** loads a small over-the-air (OTA) update with this PR’s changes.
- Usually ready in a few minutes (longer the very first time if the install app had to be built).

### 🔧 “Fluent preview app building” (native changes)

- The PR changed something that needs a **new full app install**.
- Wait until the EAS build shows **Finished** (~10–15 minutes).
- Use the **EAS build link** in that comment as your **Install Fluent** step (same install steps as Step 1 above).
- Then use OTA previews on later PRs until the app version changes again.

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| I don’t have Fluent yet | Use **Step 1 — Install Fluent** in the PR comment first. |
| Link opens browser but not Fluent | Complete Step 1, then try Step 2 again. Choose **Fluent** when prompted. |
| Phone offers **Expo Go** | Cancel. Install **Fluent** from the **Install Fluent** link. |
| “Unable to load update” | Your Fluent app may be the wrong version. Tap **Install Fluent** in the comment again (or wait for a **native preview** comment on the PR). |
| QR scan does nothing | Finish Step 1 first. Use **Scan QR code** inside Fluent. |
| Install blocked | Allow **Install unknown apps** for your browser (Step 1). |
| No bot comment on PR | Ask a developer to add the **`preview-build`** label. |
| expo.dev asks me to log in | Request access to the Fluent project from your team lead. |

---

## For developers

1. Add the **`preview-build`** label to the PR.
2. Share this guide with QA: `docs/guides/qa-preview-testing.md`
3. The workflow auto-finds or builds a matching **Install Fluent** APK before posting OTA previews.

Technical details: [`.github/README.md`](../../.github/README.md) · [`.eas/README.md`](../../.eas/README.md)
