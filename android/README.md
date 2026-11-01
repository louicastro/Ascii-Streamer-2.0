# ASCILI Android Application

Official Android Application for **ASCILI (Ascii-Streamer 2.0)** — Real-Time High-Performance ASCII Video Streaming & Media Workstation.

---

## 📱 Build Artifacts Ready for Use

| Package File | Size | Purpose |
| :--- | :--- | :--- |
| [**`dist-apk/ascili-v2.4.0-release.apk`**](file:///home/loui/Pictures/Ascii-Streamer-2.0-main/dist-apk/ascili-v2.4.0-release.apk) | **~2.5 MB** | **Production Release APK**: `debuggable=false`, package `com.asciistreamer.ascili`, minified with R8, resource shrunk, and fully optimized. Ready to install directly on Android devices. |
| [**`dist-apk/ascili-v2.4.0-release.aab`**](file:///home/loui/Pictures/Ascii-Streamer-2.0-main/dist-apk/ascili-v2.4.0-release.aab) | **~3.2 MB** | **Google Play App Bundle (AAB)**: Upload directly to the Google Play Console (Target SDK 35). |
| [**`dist-apk/ascili-v2.4.0-debug.apk`**](file:///home/loui/Pictures/Ascii-Streamer-2.0-main/dist-apk/ascili-v2.4.0-debug.apk) | **~5.9 MB** | **Debug APK**: Unobfuscated testing build with Chrome DevTools WebView debugging enabled. |

---

## 🛡️ Google Play Security Guidelines & Policy Compliance

This application was engineered strictly in accordance with Google Play Developer Policies and Android Security Best Practices:

### 1. Target SDK & Android 15 Support
- **Target SDK**: `35` (Android 15)
- **Compile SDK**: `35` (Android 15)
- **Minimum SDK**: `26` (Android 8.0 Oreo, covers 95%+ of active devices globally)
- Meets all Google Play Target API Level requirements.

### 2. WebView Security Hardening
- **Local Asset Isolation via `WebViewAssetLoader`**:
  - Assets are resolved through the virtual secure origin `https://appassets.androidplatform.net/assets/`.
  - Disables deprecated and vulnerable `file:///android_asset/` and `file://` schemes.
  - Mitigates local file disclosure and path traversal vulnerabilities (CWE-22).
- **Restricted WebView Settings**:
  - `setAllowFileAccess(false)`
  - `setAllowContentAccess(false)`
  - `setAllowFileAccessFromFileURLs(false)`
  - `setAllowUniversalAccessFromFileURLs(false)`
  - `setSavePassword(false)`
  - `setGeolocationEnabled(false)`
  - `setSafeBrowsingEnabled(true)`
- **Strict SSL Error Enforcement**:
  - `onReceivedSslError()` explicitly aborts with `handler.cancel()` and never ignores certificate failures (compliant with Google Play SSL error suspension policies).
- **Navigation Scheme Whitelisting & Intent Injection Prevention**:
  - `shouldOverrideUrlLoading()` permits navigation only within `appassets.androidplatform.net`.
  - External web links (`https://` or `http://`) launch safely in the system browser with `Intent.CATEGORY_BROWSABLE` and cleared component/selector fields, preventing Intent Redirection attacks.
  - Potentially malicious schemes (`javascript:`, `file:`, `intent:`) are blocked.

### 3. Hardware Permission & Privacy Hardening
- **Camera & Microphone Isolation**:
  - `onPermissionRequest()` in `AsciliChromeClient` validates origin strictly against `https://appassets.androidplatform.net`. Third-party iframes cannot access camera hardware.
  - Native runtime permissions are checked and requested prior to granting HTML5 `getUserMedia`.
- **Least-Privilege Principle (`uses-feature`)**:
  - Camera and Microphone features are declared with `android:required="false"`, allowing Chromebooks and camera-less tablets to install the app without rejection.
- **Modern Scoped Storage Compliance (Zero Dangerous Storage Permissions)**:
  - Does **NOT** request legacy permissions (`READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`).
  - Exports (videos, GIFs, subtitles) are saved using Android's modern `MediaStore` (`MediaStore.Video.Media`, `MediaStore.Downloads`, `MediaStore.Images`).
  - Native file sharing operates securely via `androidx.core.content.FileProvider`.
- **In-App Privacy Policy**:
  - Includes transparent in-app Privacy Notice detailing that all video transformation and rendering occurs 100% on-device and zero biometric, video, or audio data is ever transmitted to remote servers.

### 4. ProGuard & R8 Code Protection
- ProGuard rules (`proguard-rules.pro`) preserve JavaScript interface methods (`@JavascriptInterface`) and obfuscate internal code while stripping unused methods and classes, reducing APK size from 5.9MB down to 2.5MB.

---

## 🛠️ Project Structure

```
android/
├── app/
│   ├── build.gradle               # Module configuration (SDK 35, dependencies, R8)
│   ├── proguard-rules.pro         # ProGuard / R8 code shrinking rules
│   └── src/main/
│       ├── AndroidManifest.xml    # Security manifest, exported attributes, permissions
│       ├── assets/                # Self-contained ASCILI web engine, workers & offline fonts
│       │   ├── fonts/             # Bundled JetBrains Mono offline woff2 fonts
│       │   ├── index.html         # Main entry HTML
│       │   ├── sw.js              # Service Worker (ascili-cache-v4, Stale-While-Revalidate)
│       │   ├── src/               # Engine, Exporter, Worker, Bridge scripts
│       │   └── public/            # Icons, manifests
│       ├── java/com/asciistreamer/ascili/
│       │   ├── MainActivity.java           # Main Activity & lifecycle management
│       │   ├── AsciliChromeClient.java     # Hardware permission & file chooser handler
│       │   ├── AsciliWebViewClient.java    # Secure WebViewAssetLoader & URL filtering
│       │   └── AsciliWebAppInterface.java  # Native storage, sharing & haptics bridge
│       └── res/
│           ├── layout/activity_main.xml    # Edge-to-edge frame layout
│           ├── values/                     # Strings, colors, styles
│           ├── values-night/               # Dark cyberpunk theme
│           ├── xml/network_security_config.xml # Cleartext HTTP traffic blocked
│           ├── xml/file_paths.xml          # Secure FileProvider paths
│           └── mipmap-*/                   # Adaptive high-DPI launcher icons
├── build.gradle                   # Top-level project Gradle build file
├── gradle/wrapper/                # Gradle 8.9 wrapper binaries and properties
├── gradlew                        # Unix Gradle wrapper script
├── gradlew.bat                    # Windows Gradle wrapper script
├── gradle.properties              # JVM memory & AndroidX settings
├── local.properties               # Android SDK directory path
└── settings.gradle                # Gradle repository and plugin management
```

---

## 🚀 Building from Source

### Prerequisites
- JDK 17 or higher
- Android SDK with Platform 35 (`platforms;android-35`) and Build Tools (`build-tools;35.0.0`)

### Compile Debug APK
```bash
cd android
./gradlew assembleDebug
```
Output: `app/build/outputs/apk/debug/app-debug.apk`

### Compile Release APK
```bash
cd android
./gradlew assembleRelease
```
Output: `app/build/outputs/apk/release/app-release.apk`

### Compile Google Play App Bundle (AAB)
```bash
cd android
./gradlew bundleRelease
```
Output: `app/build/outputs/bundle/release/app-release.aab`

---

## 📲 Installing on an Android Device

### Option 1: Via ADB (Command Line)
```bash
adb install -r dist-apk/ascili-v2.0.0-release.apk
```

### Option 2: Direct File Transfer
1. Send `dist-apk/ascili-v2.0.0-release.apk` to your phone via USB, Bluetooth, Google Drive, or Telegram.
2. Tap the `.apk` file on your phone and choose "Install".
