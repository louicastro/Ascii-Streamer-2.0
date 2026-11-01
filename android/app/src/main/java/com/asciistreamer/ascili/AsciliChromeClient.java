package com.asciistreamer.ascili;

import android.net.Uri;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Hardened WebChromeClient enforcing origin isolation for media permissions
 * and supporting native file selection.
 */
public class AsciliChromeClient extends WebChromeClient {
    private static final String TAG = "AsciliChromeClient";
    public static final String TRUSTED_DOMAIN = "appassets.androidplatform.net";

    private final MainActivity activity;

    public AsciliChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    /**
     * Intercepts HTML5 media device requests (Webcam, Microphone).
     * Enforces strict origin checking before granting access to device hardware.
     */
    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (request == null) return;

        Uri originUri = request.getOrigin();
        String host = originUri != null ? originUri.getHost() : null;
        String scheme = originUri != null ? originUri.getScheme() : null;
        String originStr = originUri != null ? originUri.toString() : "";
        if (originStr.endsWith("/")) {
            originStr = originStr.substring(0, originStr.length() - 1);
        }

        boolean isTrusted = (TRUSTED_DOMAIN.equalsIgnoreCase(host) && "https".equalsIgnoreCase(scheme))
                || ("https://" + TRUSTED_DOMAIN).equalsIgnoreCase(originStr);

        if (!isTrusted) {
            Log.w(TAG, "Blocked unauthorized permission request from untrusted origin: " + originUri);
            activity.runOnUiThread(request::deny);
            return;
        }

        List<String> requestedList = Arrays.asList(request.getResources());
        boolean needsCamera = requestedList.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        boolean needsAudio = requestedList.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);

        if ((needsCamera && !activity.hasCameraPermission()) || (needsAudio && !activity.hasAudioPermission())) {
            // Request native runtime permissions on UI thread
            activity.runOnUiThread(() -> {
                activity.requestNativePermissions(needsCamera, needsAudio, () -> {
                    List<String> grantedResources = new ArrayList<>();
                    if (needsCamera && activity.hasCameraPermission()) {
                        grantedResources.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                    }
                    if (needsAudio && activity.hasAudioPermission()) {
                        grantedResources.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                    }

                    activity.runOnUiThread(() -> {
                        try {
                            if (!grantedResources.isEmpty()) {
                                request.grant(grantedResources.toArray(new String[0]));
                                Log.i(TAG, "Granted permissions after native prompt: " + grantedResources);
                            } else {
                                request.deny();
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Failed granting permissions after prompt", e);
                        }
                    });
                }, () -> activity.runOnUiThread(request::deny));
            });
        } else {
            List<String> grantedResources = new ArrayList<>();
            if (needsCamera && activity.hasCameraPermission()) {
                grantedResources.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
            }
            if (needsAudio && activity.hasAudioPermission()) {
                grantedResources.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
            }

            activity.runOnUiThread(() -> {
                try {
                    if (!grantedResources.isEmpty()) {
                        request.grant(grantedResources.toArray(new String[0]));
                        Log.i(TAG, "Granted permissions immediately: " + grantedResources);
                    } else {
                        request.deny();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed granting permissions immediately", e);
                }
            });
        }
    }

    @Override
    public void onPermissionRequestCanceled(PermissionRequest request) {
        super.onPermissionRequestCanceled(request);
        Log.i(TAG, "Permission request canceled by browser.");
    }

    /**
     * Native file selection dialog for loading local video files into ASCII engine.
     */
    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
        return activity.openFileChooser(filePathCallback, fileChooserParams);
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        Log.d("ASCILI_JS", "[" + consoleMessage.messageLevel() + "] " +
                consoleMessage.message() + " -- From line " +
                consoleMessage.lineNumber() + " of " +
                consoleMessage.sourceId());
        return true;
    }
}
