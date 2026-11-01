# ProGuard / R8 Rules for ASCILI (com.asciistreamer.ascili)
# Compliant with Google Play Store Security & Obfuscation Standards

# Keep JavaScript Interface annotations and methods intact for WebView communication
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve the native JavaScript interface bridge class
-keep class com.asciistreamer.ascili.AsciliWebAppInterface {
    public *;
}

# Keep AndroidX WebKit AssetLoader and compatibility classes
-keep class androidx.webkit.** { *; }

# Keep Material and AndroidX core components
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**

# Preserve annotations for security reflection
-keepattributes JavascriptInterface
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
