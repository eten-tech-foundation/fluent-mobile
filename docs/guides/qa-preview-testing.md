# How to test a Fluent Mobile PR preview (Android)

Plain-language guide for QA and reviewers. **No developer tools required** — just an Android phone.

## Important: Fluent is not Expo Go

Fluent uses a **custom dev client** (the **Fluent** app your team installs from an EAS build). It is **not** the generic **Expo Go** app from the Play Store.

| App | Can test Fluent previews? |
|-----|---------------------------|
| **Fluent** (dev client / preview APK from your team) | ✅ Yes |
| **Expo Go** (Play Store) | ❌ No — will not work |

If someone tells you to “use Expo Go,” that is outdated for this project.

---

## What you need first

1. An **Android phone** (physical device recommended; emulator is for developers only).
2. The **Fluent** app installed — a **preview APK** or **dev client** build from EAS.
3. Access to the **GitHub pull request** where a bot posted a preview comment (after someone added the `preview-build` label).

**Do not have Fluent installed yet?**  
Ask your team for the latest preview APK, or open a PR comment titled **“Fluent preview app building”**, wait for the build to finish (~10–15 minutes), and install from the EAS link. See [Install the Fluent app](#install-the-fluent-app-first-time-or-after-native-changes) below.

---

## Two kinds of preview comments

GitHub Actions posts **one** of these on the PR:

### 📲 “Preview update ready” (JavaScript / UI only)

- The app on your phone **downloads an over-the-air (OTA) update** — like a small patch.
- You **must already have** Fluent installed with a **matching runtime version** (shown in the comment).
- Fast — usually ready in a couple of minutes.

### 🔧 “Fluent preview app building” (native changes)

- The team changed something that requires a **new APK** (full app install).
- Wait for the build to finish, then **download and install** the new Fluent APK.
- Required after native/config changes or if OTA previews fail with a version mismatch.

---

## Install the Fluent app (first time or after native changes)

1. On your phone, open the **EAS build link** from the PR comment (you may need to sign in to [expo.dev](https://expo.dev) with an account your team invited).
2. When the build status is **Finished**, tap **Download** or **Install** to get the APK.
3. If Android warns about unknown apps:
   - Go to **Settings → Security** (wording varies by phone).
   - Find **Install unknown apps** and allow your **browser** or **Files** app to install APKs.
4. Open **Fluent** from your home screen.
5. You should see the **development / project** screen (Expo dev client UI) — **not** the Expo Go orange icon app.

**Runtime version:** Note the **runtime version** in the PR comment. OTA previews only work when your installed app matches that version. After installing a new APK from a native preview build, use the runtime version from **that** comment going forward.

---

## Load a JavaScript preview (OTA)

Use the comment titled **“Preview update ready.”**

### Option A — Tap the link (easiest)

1. Open the **PR on your Android phone** (GitHub mobile site or app).
2. Find the bot comment and tap **“Open preview in Fluent.”**
3. If asked **“Open with Fluent?”** (or similar), choose **Fluent** — **not** Expo Go, not Chrome-only.
4. Wait for the update to download (Wi‑Fi helps).
5. When the dev client opens your project, sign in and test.

### Option B — Scan the QR code

1. Open the **Fluent** app on your phone.
2. On the dev client home screen, tap **Scan QR code** (wording may vary).
3. Point the camera at the **QR image** in the PR comment.

**Or** use your phone’s **Camera** app on the QR code:

- Android should show a banner like **“Open in Fluent.”**
- If it offers **Expo Go**, **cancel** — the QR is wrong for this project or Fluent is not installed.

### Option C — Automatic update

1. Fully close Fluent (swipe it away from recent apps).
2. Reopen Fluent and stay on the dev client screen for ~10 seconds.
3. If your app is on the `preview` channel with the right runtime version, it may pick up the latest update without scanning.

### After loading

- Force-close and reopen Fluent if the UI still looks like the old build.
- Sign in with your test account and follow the PR’s test notes.

---

## Test a native preview (new APK)

Use the comment titled **“Fluent preview app building.”**

1. Wait until the EAS build link shows **Finished** (refresh the page).
2. Install the new APK (steps in [Install the Fluent app](#install-the-fluent-app-first-time-or-after-native-changes)).
3. Open Fluent and confirm it launches.
4. Complete QA on the PR — this APK **includes** the native changes.
5. Later PRs with **only JS changes** can use OTA again **if** runtime version still matches.

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Link opens browser but not Fluent | Install Fluent first. Tap the link again and choose **Fluent** when prompted. |
| Phone offers **Expo Go** | Do not use Expo Go. Install **Fluent** from the team’s EAS APK link. |
| “Unable to load update” / version error | Runtime version mismatch. Install the latest **native preview APK** from a recent PR, then retry the OTA link. |
| QR scan does nothing | Open Fluent → use **Scan QR code** inside the app instead of a third-party scanner. |
| Install blocked | Enable **Install unknown apps** for your browser/Files app (see install steps above). |
| No preview comment on PR | A developer must add the **`preview-build`** label to the PR. |
| Build link asks for login | Request access to the Fluent EAS project from your team lead. |

---

## For developers (adding a preview)

1. Add the **`preview-build`** label to the PR.
2. Wait for the GitHub Actions comment on the PR.
3. Share this guide with QA: `docs/guides/qa-preview-testing.md`

Technical details: [`.github/README.md`](../../.github/README.md) and [`.eas/README.md`](../../.eas/README.md).
