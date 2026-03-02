# AudioStudio — React Native Audio Recording & Processing App

AudioStudio is a React Native mobile application that enables high-quality audio recording, storage, and native audio processing on Android using modern native architecture.

The app records audio using Nitro Sound (JSI native module) and processes recordings using a Media3 Transformer native bridge for operations like splicing, combining, and format conversion.

---

## Architecture Overview

```
React Native UI
        ↓
Recorder Service (JS)
        ↓
Nitro Sound Native Module (JSI)
        ↓
Android Native Audio Recorder
        ↓
Audio file saved locally
        ↓
Media3 Transformer Native Bridge
        ↓
Processed audio output
```

Full architecture documentation:
https://bridgeconn-my.sharepoint.com/:w:/r/personal/alphin_varghese_bridgeconn_com2/_layouts/15/Doc.aspx?sourcedoc=%7Be74abddf-6b2b-439d-898a-e65637928b14%7D&action=edit&wdPid=25a668aa

---

## Tech Stack

* React Native
* TypeScript
* Nitro Modules (JSI)
* Android MediaRecorder / AudioRecord
* Android Media3 Transformer
* Kotlin native modules

---

## Setup Instructions


### Install dependencies

```
npm install
```

---

### Android setup


```
cd android
./gradlew clean
cd ..
```

---


### Verify connected Android device

```
adb devices
```

### Run the app

```
npx react-native run-android
```
