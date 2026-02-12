# React Native Android + FFmpeg Setup

## Full Issue Log & Status Notes

This document records the setup attempts, errors, and investigation steps while trying to configure **audio export and FFmpeg processing** in a React Native Android environment.

This is an **ongoing debugging record**, not a completed setup guide.

---

## Initial Goal

Export recorded audio from a React Native Android app using FFmpeg.

### Target Processing

* Convert input audio
* Resample to **48kHz**
* Convert to **mono**
* Export as **PCM 24-bit WAV**

### Example FFmpeg Command

```bash
ffmpeg -y -i input_audio_file -ar 48000 -ac 1 -c:a pcm_s24le output.wav
```

---

## Issue Log & Investigation

---

### 1 Android Permission Confusion

**Problem**
Uncertainty about where Android permissions should be declared and how they affect file access.

**Investigation Notes**
Permissions must be declared in:

```
android/app/src/main/AndroidManifest.xml
```

Additional permissions may be required depending on storage location.

**Status**
Understanding of permission placement established.
Impact on build/export still being evaluated.

---

### 2️2 ffmpeg-kit-react-native Dependency Failure

**Error**

```
Could not find:
com.arthenica:ffmpeg-kit-https:6.0-2
```

**Observed Conditions**

* Artifact unavailable in Maven
* Package appears deprecated
* Library no longer hosted

**Action Taken**
Removed dependency:

```
npm uninstall ffmpeg-kit-react-native
```

**Status**
Library not usable. Alternative approach required.

---

### 3️3 react-native-ffmpeg Installation Failure

**Error**
Missing `jcenter()` repository.

**Observed Conditions**

* Library depends on removed repository
* Build configuration outdated
* Project cannot resolve dependency

**Action Taken**
Library removed from project.

**Status**
Native FFmpeg approach under consideration.

---

### 4️4 Gradle Distribution Download Failure

**Error**
Gradle wrapper attempted download:

```
https://github.com/gradle/gradle-distributions/releases/download/v7.6.0
```

Result:

```
FileNotFoundException
```

**Observed Cause**
Distribution URL invalid or unavailable.

**Action Taken**
Distribution URL manually edited in:

```
gradle-wrapper.properties
```

**Status**
Download issue no longer primary blocker. Build still failing for other reasons.

---

### 5️5 Kotlin Plugin vs Gradle Version Conflict

**Error**
Kotlin plugin incompatible with Gradle 7.6
Requires ≥ 7.6.3

**Action Taken**
Gradle wrapper version changed to:

```
7.6.3
```

**Status**
Version alignment attempted. Further compatibility still under observation.

---

### 6️6 Java Not Detected by Gradle

**Error**

```
Path does not contain Java executable:
/usr/lib/jvm/openjdk-17
```

**Observed Cause**
JAVA_HOME pointing to incorrect location.

**Action Taken**

Installed JDK 17 and set environment variables:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
```

Added to:

```
~/.gradle/gradle.properties
```

```
org.gradle.java.home=/usr/lib/jvm/java-17-openjdk-amd64
```

**Status**
Java present on system, but Gradle detection behaviour still inconsistent.

---

### 7️7 Java Toolchain vs Compatibility Conflict (PRIMARY BLOCKER)

**Errors Observed**

```
Java toolchain cannot be used with sourceCompatibility / targetCompatibility
```

AND

```
No compatible toolchains found for request specification: Java 17
```

**Observed Conditions**

* React Native Gradle plugin uses Java toolchain automatically
* Project also defines manual compatibility settings
* Gradle reports toolchain mismatch or absence

**Action Taken**
Manual compatibility settings removed from Gradle files.

**Current Status**
 Still failing
Gradle unable to locate or use compatible Java toolchain.

This is the main blocking issue preventing build completion.

---

### 8️8 Deprecated Gradle Features

**Observation**
Warnings about Gradle 10 compatibility.

**Impact**
Warnings only. Not main failure cause.

---

### 9️9 Dependency Cache Behaviour

**Symptoms**
Build failures continue after configuration changes.

**Action Taken**

```bash
cd android
./gradlew --stop
rm -rf ~/.gradle/caches
rm -rf .gradle
./gradlew clean
```

**Status**
Cache reset performed. Build still failing.



##  Current State of Project

* Deprecated FFmpeg libraries unusable
* Gradle wrapper version adjusted
* Java installed and environment variables set
* Multiple build configuration changes attempted
* Gradle caches cleared multiple times

 Android build still failing
 Java toolchain detection still failing
 FFmpeg integration not started
 Audio export not tested

---

## Active Blocking Error

```
No compatible toolchains found for request specification: {languageVersion=17}
```

Gradle cannot detect or use Java 17 toolchain despite Java being installed.

---

##  Open Investigation Areas

* React Native Gradle plugin configuration
* Gradle JVM selection
* System vs Gradle JDK mismatch
* Toolchain auto-download disabled

---

##  Lessons Observed So Far

1. Many React Native FFmpeg libraries are deprecated.
2. Maven artifacts can disappear unexpectedly.
3. React Native requires Java 17.
4. React Native manages Java toolchains internally.
5. Manual Java compatibility settings may conflict with toolchains.
6. JAVA_HOME correctness does not guarantee Gradle detection.
7. Gradle cache resets do not always resolve toolchain issues.

---

##  Purpose of This Document

This README functions as:

* Setup attempt log
* Error tracking record
* Environment debugging reference
* Ongoing investigation notes

---

##  Project Status

**Build not successful.
Environment not stabilized.
Toolchain detection unresolved.**

Work in progress.
