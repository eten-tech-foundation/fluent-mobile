# Fluent Mobile

**Android-only** — there is no iOS app.

**Expo SDK 56** (React Native 0.85) with **CNG** (Continuous Native Generation): the `android/` folder is **not committed**. It is generated locally via `expo prebuild --platform android` from `app.config.ts` and config plugins.

**Custom dev client — not Expo Go.** This app uses native modules (`expo-dev-client`, `op-sqlite`, keychain, etc.) and must run in a **development build** you compile locally (`npm run android`) or install from EAS. It will **not** work in the Expo Go app from the Play Store.

**For AI agents / contributors:** see [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md) for repo layout, architecture, commands, and Cursor rules.

## Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js 24](https://nodejs.org/en/) — `>= 24.14.0` (see `package.json` engines)
- [Android Studio](https://developer.android.com/studio) — Android SDK, emulator, and JDK 17
- **npm** — package manager for this repo (not yarn/pnpm)

---

## Step 1: Install Node 24

Check your current Node version:

```bash
node --version
```

If it's not version 24, install and switch to it using NVM:

```bash
# install and use node 24
nvm install 24.14.0
nvm use 24.14.0

# verify
node --version  # verify it is v24.x.x
```

---

## Step 2: Install Android Studio

Download from https://developer.android.com/studio and run the installer for your OS. Complete the setup wizard (defaults are fine) so the **Android SDK** is installed.

<details>
<summary><strong>Linux</strong> (tarball install)</summary>

```bash
tar -xzf android-studio-*-linux.tar.gz
sudo mv android-studio /opt/android-studio
/opt/android-studio/bin/studio.sh
```

Optional desktop entry: create `/usr/share/applications/android-studio.desktop` pointing `Exec` at `/opt/android-studio/bin/studio.sh`.

</details>

<details>
<summary><strong>macOS</strong></summary>

Open the `.dmg`, drag **Android Studio** to **Applications**, and launch it from there.

Default SDK path: `~/Library/Android/sdk`

</details>

<details>
<summary><strong>Windows</strong></summary>

Run the `.exe` installer. Default SDK path is usually `%LOCALAPPDATA%\Android\Sdk`.

</details>

---

## Step 3: Install Java (JDK 17)

Android builds require **JDK 17**. Android Studio’s embedded JDK often works; if Gradle complains about Java, set `JAVA_HOME` explicitly.

Check your version:

```bash
java -version
```

<details>
<summary><strong>Linux</strong> — install OpenJDK 17 if needed</summary>

```bash
sudo apt update
sudo apt install openjdk-17-jdk
readlink -f $(which java)   # use parent of /bin/java as JAVA_HOME
```

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
/usr/libexec/java_home -V          # list installed JDKs
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

Or use the JDK bundled with Android Studio (typical path under `Android Studio.app/Contents/jbr`).

</details>

<details>
<summary><strong>Windows</strong></summary>

Install JDK 17 (or use Android Studio’s bundled JBR) and set **JAVA_HOME** in System Environment Variables.

</details>

---

## Step 4: Set Up Environment Variables

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or Windows environment variables):

```bash
export ANDROID_HOME=$HOME/Android/Sdk          # macOS: $HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

export JAVA_HOME=/path/to/jdk-17                # see Step 3
export PATH=$PATH:$JAVA_HOME/bin
```

> **Paths:** Linux emulator SDK is usually `~/Android/Sdk`. macOS is `~/Library/Android/sdk`. Windows is `%LOCALAPPDATA%\Android\Sdk`. Confirm in Android Studio → **Settings → Android SDK** (SDK location at the top).

Reload your shell (e.g. `source ~/.zshrc` or `source ~/.bashrc`) and verify:

```bash
adb --version
java -version
echo $ANDROID_HOME
echo $JAVA_HOME
```

---

## Step 5: Set Up an Android Emulator

1. Open **Android Studio**
2. Go to **More Actions → Virtual Device Manager** (or **Tools → Device Manager**)
3. **Create Device** → pick a phone (e.g. Pixel 6) → Next
4. Download and select a system image (**API 33+** recommended)
5. Finish, then press **▶** to start the emulator

Wait for the emulator to fully boot before continuing.

---

## Step 6: Install Dependencies

Clone the repo and install:

```bash
git clone https://github.com/eten-tech-foundation/fluent-mobile.git
cd fluent-mobile
npm install
```

Generate the native Android project (required before first run):

```bash
npm run prebuild   # expo prebuild --clean --platform android
```

This creates a local `android/` directory (gitignored). **Re-run prebuild** when you change `app.config.ts`, files under `plugins/`, `eas.json`, or add/update native dependencies in `package.json`. After a failed prebuild, `rm -rf android` then prebuild again.

Bootsplash assets (`assets/bootsplash/`) are committed. Regenerate after changing the logo or splash background (Android only):

```bash
npx react-native-bootsplash generate assets/bootsplash/logo.png \
  --platforms=android \
  --background=#0B50D0 \
  --logo-width=100 \
  --assets-output=assets/bootsplash \
  --project-type=expo
```

Copy environment variables:

```bash
cp .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_API_BASE_URL` (use `http://10.0.2.2:9999` for the Android emulator).

---

## Step 7: Run the App

Open two terminal windows from the project root.

**Terminal 1 — Start Metro (Expo dev server):**

```bash
npm start
```

**Terminal 2 — Build and run the dev client on Android:**

```bash
npm run android
```

`npm run android` runs `expo run:android`, which **compiles and installs** the custom dev client on the emulator. The **first build can take several minutes**; later runs are faster.

Do **not** open this project in **Expo Go** — it requires this dev client because of custom native code.

The app should launch in your emulator once the build finishes and Metro is running.

**Optional — EAS dev client:** To install a dev build from the cloud instead of compiling locally:

```bash
npx eas build --profile development --platform android
```

Requires an [Expo access token](https://expo.dev/settings/access-tokens) and access to EAS project `fluent-mobile`.

---

## Troubleshooting

**`Failed to download remote update` / `No returned query result` on launch**
Local dev builds must not check Expo OTA on startup. Rebuild after pulling latest `main`:

```bash
npm run prebuild
npm run android
```

Then keep Metro running (`npm start`). If you installed an old **EAS dev-client** or **preview** APK by mistake, uninstall it and use a fresh local build or the PR **Install Fluent** link — see [docs/guides/qa-preview-testing.md](docs/guides/qa-preview-testing.md).

**`adb: command not found`**
Your environment variables aren't set. Complete Step 4 and reload your shell (`source ~/.zshrc`, `source ~/.bashrc`, or restart the terminal).

**`EXPO_PUBLIC_API_BASE_URL is required`**
Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` before starting the app.

**`JAVA_HOME is not set` error**
Java may be installed but `JAVA_HOME` not configured. Make sure you completed Step 3 and Step 4. If the path differs, find it with:

**Linux:**

```bash
readlink -f "$(which java)"
```

Strip `/bin/java` from the output and set `JAVA_HOME` to the remaining path.

**macOS:**

```bash
/usr/libexec/java_home -v 17
```

Use that output as `JAVA_HOME`. Then update your shell profile and reload the shell.

**`npm run android` fails with SDK not found**
Android Studio may have installed the SDK in a different location. Check:

```bash
ls ~/Android/Sdk
```

If that folder doesn't exist, open Android Studio → SDK Manager and note the SDK path shown at the top.

**Metro bundler port already in use**

```bash
npx expo start --clear
```

**Native project missing or out of date**

After changing `app.config.ts`, `plugins/`, `eas.json`, or native deps in `package.json`:

```bash
npm run prebuild   # expo prebuild --clean --platform android
```

**`MainApplication does not exist` during prebuild**

Usually a failed prebuild left a broken `android/` folder (e.g. only `.gradle`). Remove it and retry:

```bash
rm -rf android
npm run prebuild
```

**App installs but shows blank screen**

Make sure Metro is running in the other terminal before running `npm run android`.

---

## Modifying the App

Once the app is running, open any file in your editor and save — the app will reload automatically via Fast Refresh.

To force a full reload on Android: press **R** twice, or open the Dev Menu (**Ctrl + M** on Linux/Windows, **Cmd + M** on macOS emulator).

---

## Production release (Android)

Push a version tag to trigger an automated EAS production build and Play Store submit (internal track):

```bash
git tag v1.0.1
git push origin v1.0.1
```

One-time setup (Expo GitHub app, Play credentials, workflow permissions): see [`.eas/README.md`](.eas/README.md).

## PR preview (QA)

Add the **`preview-build`** label to a pull request to publish a preview OTA update (JS-only changes) or start an Android EAS preview APK (native/config changes). Requires `EXPO_TOKEN` in GitHub Actions secrets.

**QA / non-technical testers:** [How to test a PR preview](docs/guides/qa-preview-testing.md) — install the **Fluent preview APK**, then open the app (not Expo Go or Metro dev builds).

**Developers:** [`.github/README.md`](.github/README.md) · [`.eas/README.md`](.eas/README.md)
