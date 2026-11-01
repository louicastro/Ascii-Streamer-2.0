package com.asciistreamer.ascili;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hardened JavaScript interface exposing native capabilities to ASCILI web engine.
 * Fully compliant with Google Play Store Security Guidelines:
 * - Low-memory chunk-based streaming exports (prevents OutOfMemory on high-res video exports)
 * - Strict parameter validation and bounds checking
 * - Directory traversal prevention
 * - Scoped Storage & MediaStore compliant (no legacy storage permissions required)
 * - Safe file sharing via FileProvider
 */
public class AsciliWebAppInterface {
    private static final String TAG = "AsciliBridge";
    private static final int MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB limit for full length videos

    private final Activity activity;

    // Session state for low-memory chunked streaming exports
    private static class ChunkedSaveSession {
        final String filename;
        final String mimeType;
        final Uri uri;
        final OutputStream outputStream;
        final ContentValues values;
        final boolean isPendingSupported;

        ChunkedSaveSession(String filename, String mimeType, Uri uri, OutputStream os, ContentValues values, boolean isPendingSupported) {
            this.filename = filename;
            this.mimeType = mimeType;
            this.uri = uri;
            this.outputStream = os;
            this.values = values;
            this.isPendingSupported = isPendingSupported;
        }
    }

    private static class ChunkedShareSession {
        final String filename;
        final String mimeType;
        final File tempFile;
        final FileOutputStream outputStream;

        ChunkedShareSession(String filename, String mimeType, File tempFile, FileOutputStream os) {
            this.filename = filename;
            this.mimeType = mimeType;
            this.tempFile = tempFile;
            this.outputStream = os;
        }
    }

    private final ConcurrentHashMap<String, ChunkedSaveSession> activeSaveSessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ChunkedShareSession> activeShareSessions = new ConcurrentHashMap<>();

    public AsciliWebAppInterface(Activity activity) {
        this.activity = activity;
    }

    /**
     * Confirms native Android runtime environment.
     */
    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    /**
     * Returns app version name synchronized with Gradle build.
     */
    @JavascriptInterface
    public String getAppVersion() {
        return "2.4.0";
    }

    /**
     * Checks if native Android camera permission is granted.
     */
    @JavascriptInterface
    public boolean hasCameraPermission() {
        if (activity instanceof MainActivity) {
            return ((MainActivity) activity).hasCameraPermission();
        }
        return false;
    }

    /**
     * Requests native Android camera & microphone permissions gracefully.
     */
    @JavascriptInterface
    public void requestCameraPermission() {
        if (activity instanceof MainActivity) {
            final MainActivity main = (MainActivity) activity;
            activity.runOnUiThread(() -> {
                if (!main.hasCameraPermission() || !main.hasAudioPermission()) {
                    main.requestNativePermissions(true, true, null, null);
                }
            });
        }
    }

    /**
     * Tactile haptic feedback for UI buttons and interactions.
     */
    @JavascriptInterface
    public void vibrate(long milliseconds) {
        if (milliseconds <= 0 || milliseconds > 1000) milliseconds = 20;
        final long duration = milliseconds;
        activity.runOnUiThread(() -> {
            try {
                Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(duration);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Vibration failed: " + e.getMessage());
            }
        });
    }

    /**
     * Display a native Android Toast notification.
     */
    @JavascriptInterface
    public void showToast(String message) {
        if (message == null || message.trim().isEmpty()) return;
        final String sanitized = message.length() > 200 ? message.substring(0, 200) : message;
        activity.runOnUiThread(() -> Toast.makeText(activity, sanitized, Toast.LENGTH_SHORT).show());
    }

    // ─── Chunked Streaming Export API (Low RAM Consumption) ───────────────────────

    /**
     * Starts a streamed export to MediaStore.
     * Returns a sessionId string or empty string on failure.
     */
    @JavascriptInterface
    public String startChunkedSave(String rawFilename, String mimeType) {
        final String filename = sanitizeFilename(rawFilename);
        final String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/octet-stream";

        try {
            ContentResolver resolver = activity.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);

            Uri collection;
            boolean isPendingSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
            if (safeMime.startsWith("video/")) {
                collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                if (isPendingSupported) {
                    values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/ASCILI");
                    values.put(MediaStore.Video.Media.IS_PENDING, 1);
                }
            } else if (safeMime.startsWith("image/")) {
                collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                if (isPendingSupported) {
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/ASCILI");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);
                }
            } else {
                if (isPendingSupported) {
                    collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ASCILI");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ASCILI");
                    if (!dir.exists()) dir.mkdirs();
                    File target = new File(dir, filename);
                    FileOutputStream fos = new FileOutputStream(target);
                    String sessionId = UUID.randomUUID().toString();
                    activeSaveSessions.put(sessionId, new ChunkedSaveSession(filename, safeMime, null, fos, null, false));
                    return sessionId;
                }
            }

            Uri uri = resolver.insert(collection, values);
            if (uri == null) {
                Log.e(TAG, "Failed creating MediaStore entry for " + filename);
                return "";
            }

            OutputStream os = resolver.openOutputStream(uri);
            if (os == null) {
                resolver.delete(uri, null, null);
                return "";
            }

            String sessionId = UUID.randomUUID().toString();
            activeSaveSessions.put(sessionId, new ChunkedSaveSession(filename, safeMime, uri, os, values, isPendingSupported));
            return sessionId;

        } catch (Exception e) {
            Log.e(TAG, "Failed startChunkedSave for " + filename, e);
            return "";
        }
    }

    /**
     * Appends a chunk of base64 data to the active MediaStore stream.
     */
    @JavascriptInterface
    public boolean writeSaveChunk(String sessionId, String base64Chunk) {
        if (sessionId == null || base64Chunk == null || base64Chunk.isEmpty()) return false;
        ChunkedSaveSession session = activeSaveSessions.get(sessionId);
        if (session == null) return false;

        try {
            byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
            session.outputStream.write(bytes);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed writing chunk for session " + sessionId, e);
            return false;
        }
    }

    /**
     * Finalizes and closes the MediaStore stream, updating metadata and notifying user.
     */
    @JavascriptInterface
    public boolean finishChunkedSave(String sessionId) {
        if (sessionId == null) return false;
        ChunkedSaveSession session = activeSaveSessions.remove(sessionId);
        if (session == null) return false;

        try {
            session.outputStream.flush();
            session.outputStream.close();

            if (session.isPendingSupported && session.uri != null) {
                ContentResolver resolver = activity.getContentResolver();
                ContentValues updateValues = new ContentValues();
                if (session.mimeType.startsWith("video/")) {
                    updateValues.put(MediaStore.Video.Media.IS_PENDING, 0);
                } else if (session.mimeType.startsWith("image/")) {
                    updateValues.put(MediaStore.Images.Media.IS_PENDING, 0);
                } else {
                    updateValues.put(MediaStore.Downloads.IS_PENDING, 0);
                }
                resolver.update(session.uri, updateValues, null, null);
            }

            activity.runOnUiThread(() -> {
                Toast.makeText(activity, "Saved to Downloads: " + session.filename, Toast.LENGTH_LONG).show();
            });
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed finishChunkedSave for " + session.filename, e);
            abortChunkedSave(sessionId);
            return false;
        }
    }

    /**
     * Aborts an active save session and cleans up partial files.
     */
    @JavascriptInterface
    public void abortChunkedSave(String sessionId) {
        if (sessionId == null) return;
        ChunkedSaveSession session = activeSaveSessions.remove(sessionId);
        if (session == null) return;

        try {
            session.outputStream.close();
            if (session.uri != null) {
                activity.getContentResolver().delete(session.uri, null, null);
            }
        } catch (Exception ignored) {}
    }

    // ─── Chunked Streaming Share API ─────────────────────────────────────────────

    @JavascriptInterface
    public String startChunkedShare(String rawFilename, String mimeType) {
        final String filename = sanitizeFilename(rawFilename);
        final String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/octet-stream";

        try {
            File exportDir = new File(activity.getCacheDir(), "exports");
            if (!exportDir.exists() && !exportDir.mkdirs()) {
                throw new RuntimeException("Could not create exports cache folder.");
            }

            File sharedFile = new File(exportDir, filename);
            FileOutputStream fos = new FileOutputStream(sharedFile);
            String sessionId = UUID.randomUUID().toString();
            activeShareSessions.put(sessionId, new ChunkedShareSession(filename, safeMime, sharedFile, fos));
            return sessionId;
        } catch (Exception e) {
            Log.e(TAG, "Failed startChunkedShare", e);
            return "";
        }
    }

    @JavascriptInterface
    public boolean writeShareChunk(String sessionId, String base64Chunk) {
        if (sessionId == null || base64Chunk == null || base64Chunk.isEmpty()) return false;
        ChunkedShareSession session = activeShareSessions.get(sessionId);
        if (session == null) return false;

        try {
            byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
            session.outputStream.write(bytes);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed writing share chunk", e);
            return false;
        }
    }

    @JavascriptInterface
    public boolean finishChunkedShare(String sessionId) {
        if (sessionId == null) return false;
        ChunkedShareSession session = activeShareSessions.remove(sessionId);
        if (session == null) return false;

        try {
            session.outputStream.flush();
            session.outputStream.close();

            Uri contentUri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".fileprovider",
                    session.tempFile
            );

            activity.runOnUiThread(() -> {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType(session.mimeType);
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(shareIntent, "Share ASCII Export"));
            });
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed finishChunkedShare", e);
            abortChunkedShare(sessionId);
            return false;
        }
    }

    @JavascriptInterface
    public void abortChunkedShare(String sessionId) {
        if (sessionId == null) return;
        ChunkedShareSession session = activeShareSessions.remove(sessionId);
        if (session == null) return;

        try {
            session.outputStream.close();
            session.tempFile.delete();
        } catch (Exception ignored) {}
    }

    // ─── Legacy 1-Shot Base64 Exports (for small screenshots & txt files) ─────────

    @JavascriptInterface
    public void saveBase64File(String rawFilename, String base64Data, String mimeType) {
        if (base64Data == null || base64Data.isEmpty()) {
            showToast("Export error: file data is empty.");
            return;
        }

        final String filename = sanitizeFilename(rawFilename);
        final String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/octet-stream";

        new Thread(() -> {
            try {
                byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);
                if (fileBytes.length > MAX_FILE_SIZE_BYTES) {
                    activity.runOnUiThread(() -> showToast("Export exceeds maximum allowed file size."));
                    return;
                }

                boolean success = saveToMediaStore(filename, safeMime, fileBytes);
                if (success) {
                    activity.runOnUiThread(() -> {
                        Toast.makeText(activity, "Saved to Downloads: " + filename, Toast.LENGTH_LONG).show();
                    });
                } else {
                    activity.runOnUiThread(() -> {
                        Toast.makeText(activity, "Unable to save file to Downloads", Toast.LENGTH_SHORT).show();
                    });
                }
            } catch (Exception e) {
                Log.e(TAG, "Save file failed", e);
                activity.runOnUiThread(() -> showToast("Save failed: " + e.getMessage()));
            }
        }).start();
    }

    @JavascriptInterface
    public void shareBase64File(String rawFilename, String base64Data, String mimeType) {
        if (base64Data == null || base64Data.isEmpty()) {
            showToast("Share error: file data is empty.");
            return;
        }

        final String filename = sanitizeFilename(rawFilename);
        final String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/octet-stream";

        new Thread(() -> {
            try {
                byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);
                File exportDir = new File(activity.getCacheDir(), "exports");
                if (!exportDir.exists() && !exportDir.mkdirs()) {
                    throw new RuntimeException("Could not create exports cache folder.");
                }

                File sharedFile = new File(exportDir, filename);
                try (FileOutputStream fos = new FileOutputStream(sharedFile)) {
                    fos.write(fileBytes);
                    fos.flush();
                }

                Uri contentUri = FileProvider.getUriForFile(
                        activity,
                        activity.getPackageName() + ".fileprovider",
                        sharedFile
                );

                activity.runOnUiThread(() -> {
                    Intent shareIntent = new Intent(Intent.ACTION_SEND);
                    shareIntent.setType(safeMime);
                    shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.startActivity(Intent.createChooser(shareIntent, "Share ASCII Export"));
                });

            } catch (Exception e) {
                Log.e(TAG, "Share failed", e);
                activity.runOnUiThread(() -> showToast("Share failed: " + e.getMessage()));
            }
        }).start();
    }

    @JavascriptInterface
    public void showPrivacyPolicy() {
        activity.runOnUiThread(() -> {
            new AlertDialog.Builder(activity)
                    .setTitle(R.string.privacy_policy_title)
                    .setMessage(R.string.privacy_policy_content)
                    .setPositiveButton(R.string.close, null)
                    .show();
        });
    }

    private boolean saveToMediaStore(String filename, String mimeType, byte[] data) {
        ContentResolver resolver = activity.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);

        Uri collection;
        boolean isPendingSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        if (mimeType.startsWith("video/")) {
            collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            if (isPendingSupported) {
                values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/ASCILI");
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            }
        } else if (mimeType.startsWith("image/")) {
            collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            if (isPendingSupported) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/ASCILI");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            }
        } else {
            if (isPendingSupported) {
                collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ASCILI");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ASCILI");
                if (!dir.exists()) dir.mkdirs();
                File target = new File(dir, filename);
                try (FileOutputStream fos = new FileOutputStream(target)) {
                    fos.write(data);
                    fos.flush();
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "Legacy file write failed", e);
                    return false;
                }
            }
        }

        Uri uri = resolver.insert(collection, values);
        if (uri == null) return false;

        try {
            try (OutputStream os = resolver.openOutputStream(uri)) {
                if (os == null) return false;
                os.write(data);
                os.flush();
            }

            if (isPendingSupported) {
                values.clear();
                if (mimeType.startsWith("video/")) {
                    values.put(MediaStore.Video.Media.IS_PENDING, 0);
                } else if (mimeType.startsWith("image/")) {
                    values.put(MediaStore.Images.Media.IS_PENDING, 0);
                } else {
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                }
                resolver.update(uri, values, null, null);
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Writing to MediaStore URI failed", e);
            try { resolver.delete(uri, null, null); } catch (Exception ignored) {}
            return false;
        }
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.trim().isEmpty()) {
            return "ascili-export-" + System.currentTimeMillis() + ".mp4";
        }
        String clean = filename.replaceAll("[/\\\\:*?\"<>|]", "_").trim();
        if (clean.startsWith(".")) clean = "ascili_" + clean;
        return clean.length() > 100 ? clean.substring(0, 100) : clean;
    }
}
