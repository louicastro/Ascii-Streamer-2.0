package com.asciistreamer.ascili;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final String APP_URL = "https://appassets.androidplatform.net/assets/index.html";

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileChooserCallback;
    private Runnable onPermissionSuccess;
    private Runnable onPermissionDenied;

    private final ActivityResultLauncher<String[]> permissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
                boolean allGranted = true;
                for (Boolean granted : result.values()) {
                    if (granted == null || !granted) {
                        allGranted = false;
                        break;
                    }
                }

                if (allGranted) {
                    if (onPermissionSuccess != null) {
                        onPermissionSuccess.run();
                    }
                } else {
                    if (onPermissionDenied != null) {
                        onPermissionDenied.run();
                    }
                }
                onPermissionSuccess = null;
                onPermissionDenied = null;
            });

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (pendingFileChooserCallback == null) return;

                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    Intent data = result.getData();
                    if (data.getData() != null) {
                        results = new Uri[]{data.getData()};
                    } else if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                pendingFileChooserCallback.onReceiveValue(results);
                pendingFileChooserCallback = null;
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen awake while streaming or recording video
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_main);
        View rootContainer = findViewById(R.id.rootContainer);
        webView = findViewById(R.id.webView);

        // Handle edge-to-edge window insets (notches, status bar, gesture navigation bar)
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            // The bundled web UI applies top/bottom safe-area padding itself.
            // Applying those insets here as well creates a visible double gap.
            v.setPadding(insets.left, 0, insets.right, 0);
            return windowInsets;
        });

        setupSecureWebView();
        setupBackNavigation();

        // Permissions are requested on-demand in AsciliChromeClient when the user
        // activates the camera/microphone, adhering to Google Play runtime permission guidelines.

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_URL);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupSecureWebView() {
        WebSettings settings = webView.getSettings();

        // Core modern web requirements
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Mobile Viewport Fixes - Guarantees proper responsive scaling
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Security Hardening (Google Play Security Guidelines)
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setGeolocationEnabled(false);
        settings.setSavePassword(false);
        settings.setSafeBrowsingEnabled(true);

        // Media streaming optimizations
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setOffscreenPreRaster(true);

        // Keep remote debugging available for debug builds without exposing
        // production WebViews to local inspection.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Terminal aesthetics - DO NOT use setLayerType(LAYER_TYPE_HARDWARE) to prevent WebGL/Canvas glitches
        webView.setBackgroundColor(getColor(R.color.terminal_black));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Attach hardened clients and interface
        webView.setWebViewClient(new AsciliWebViewClient(this));
        webView.setWebChromeClient(new AsciliChromeClient(this));
        webView.addJavascriptInterface(new AsciliWebAppInterface(this), "AsciliAndroidBridge");
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Exit ASCILI")
                            .setMessage("Are you sure you want to exit the ASCII video workstation?")
                            .setPositiveButton("Exit", (dialog, which) -> finish())
                            .setNegativeButton("Stay", null)
                            .show();
                }
            }
        });
    }

    public boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    public boolean hasAudioPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    public void requestNativePermissions(boolean camera, boolean audio, Runnable onSuccess, Runnable onDenied) {
        List<String> perms = new ArrayList<>();
        if (camera && !hasCameraPermission()) perms.add(Manifest.permission.CAMERA);
        if (audio && !hasAudioPermission()) perms.add(Manifest.permission.RECORD_AUDIO);

        if (perms.isEmpty()) {
            if (onSuccess != null) onSuccess.run();
            return;
        }

        this.onPermissionSuccess = onSuccess;
        this.onPermissionDenied = onDenied;
        permissionLauncher.launch(perms.toArray(new String[0]));
    }

    public boolean openFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (pendingFileChooserCallback != null) {
            pendingFileChooserCallback.onReceiveValue(null);
        }
        pendingFileChooserCallback = callback;

        Intent intent = null;
        if (params != null) {
            try {
                intent = params.createIntent();
            } catch (Exception ignored) {}
        }
        if (intent == null) {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "image/*"});
            intent.addCategory(Intent.CATEGORY_OPENABLE);
        }

        try {
            fileChooserLauncher.launch(Intent.createChooser(intent, "Select Video or Image"));
            return true;
        } catch (Exception e) {
            Toast.makeText(this, "Could not open the media picker.", Toast.LENGTH_SHORT).show();
            if (pendingFileChooserCallback != null) {
                pendingFileChooserCallback.onReceiveValue(null);
                pendingFileChooserCallback = null;
            }
            return false;
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingFileChooserCallback != null) {
            pendingFileChooserCallback.onReceiveValue(null);
            pendingFileChooserCallback = null;
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
