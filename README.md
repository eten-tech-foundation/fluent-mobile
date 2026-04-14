# Fluent Mobile

## Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js 24](https://nodejs.org/en/) — the app requires Node 24 specifically
- [Android Studio](https://developer.android.com/studio) — for the Android emulator

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

1. Download Android Studio from https://developer.android.com/studio
2. Extract and install it:

```bash
tar -xzf android-studio-*-linux.tar.gz
sudo mv android-studio /opt/android-studio
/opt/android-studio/bin/studio.sh
```

3. Follow the setup wizard — it will download the Android SDK automatically. Just click through the defaults.

**Optional: Add Android Studio to your applications menu**

```bash
sudo gedit /usr/share/applications/android-studio.desktop
```

Paste this in and save:

```
[Desktop Entry]
Version=1.0
Type=Application
Name=Android Studio
Exec=/opt/android-studio/bin/studio.sh
Icon=/opt/android-studio/bin/studio128.png
Categories=Development;IDE;
Terminal=false
StartupNotify=true
```

---

## Step 3: Install Java (JDK 17)

Check if Java is already installed:

```bash
java -version
```

If not installed, install JDK 17:

```bash
sudo apt update
sudo apt install openjdk-17-jdk
```

Find the installation path:

```bash
readlink -f $(which java)
# example output: /usr/lib/jvm/java-17-openjdk-amd64/bin/java
```

You'll need this path (minus `/bin/java`) in the next step when setting up environment variables.

---

## Step 4: Set Up Environment Variables

Add the following to your `~/.bashrc`:

```bash
gedit ~/.bashrc
```

Paste at the bottom:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$PATH:$JAVA_HOME/bin
```

> **Note:** Replace `/usr/lib/jvm/java-17-openjdk-amd64` with the path you found in Step 3 if it differs.

Apply the changes:

```bash
source ~/.bashrc
```

Verify it worked:

```bash
adb --version   # should print a version number
java -version   # should print java 17
echo $JAVA_HOME # should print the path you set
```

---

## Step 5: Set Up an Android Emulator

1. Open Android Studio: `/opt/android-studio/bin/studio.sh`
2. Go to **More Actions → Virtual Device Manager**
3. Click **Create Device**
4. Pick a phone (e.g. Pixel 6) and click Next
5. Download and select a system image (API 33 or higher recommended)
6. Click Finish, then press the ▶ Play button to start the emulator

Wait for the emulator to fully boot before continuing.

---

## Step 6: Install Dependencies

Clone the repo and install:

```bash
git clone https://github.com/eten-tech-foundation/fluent-mobile.git
cd fluent-mobile
git checkout MVP_PoC_mobile_companion_app
npm install
```

---

## Step 7: Run the App

Open two terminal windows from the project root.

**Terminal 1 — Start Metro:**

```bash
npm start
```

**Terminal 2 — Run on Android:**

```bash
npm run android
```

The app should launch in your emulator automatically.

---

## Troubleshooting

**`adb: command not found`**
Your environment variables aren't set. Make sure you completed Step 4 and ran `source ~/.bashrc`.

**`JAVA_HOME is not set` error**
Java may be installed but `JAVA_HOME` not configured. Make sure you completed Step 3 and Step 4. If the path differs, find it with:
```bash
readlink -f $(which java)
```
Strip `/bin/java` from the output, update `JAVA_HOME` in `~/.bashrc`, then run `source ~/.bashrc`.

**`npm run android` fails with SDK not found**
Android Studio may have installed the SDK in a different location. Check:

```bash
ls ~/Android/Sdk
```

If that folder doesn't exist, open Android Studio → SDK Manager and note the SDK path shown at the top.

**Metro bundler port already in use**

```bash
npx react-native start --reset-cache
```

**App installs but shows blank screen**
Make sure Metro is running in the other terminal before running `npm run android`.

---

## Modifying the App

Once the app is running, open any file in your editor and save — the app will reload automatically via Fast Refresh.

To force a full reload on Android: press **R** twice, or use **Ctrl + M** to open the Dev Menu.
