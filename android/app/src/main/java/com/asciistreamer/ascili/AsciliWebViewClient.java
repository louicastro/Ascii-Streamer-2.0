package com.asciistreamer.ascili;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.http.SslError;
import android.util.Log;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Hardened WebViewClient enforcing secure local asset resolution via WebViewAssetLoader
 * and strict external URL navigation security.
 */
public class AsciliWebViewClient extends WebViewClient {
    private static final String TAG = "AsciliWebViewClient";
    public static final String TRUSTED_DOMAIN = "appassets.androidplatform.net";

    private final WebViewAssetLoader assetLoader;
    private final Context context;

    public AsciliWebViewClient(Context context) {
        this.context = context;
        this.assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(TRUSTED_DOMAIN)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();
    }

    /**
     * Maps local packaged assets to secure virtual domain https://appassets.androidplatform.net/assets/
     * This avoids file:/// schemes entirely, satisfying Google Play security and enabling
     * Web Workers, Service Workers, and getUserMedia.
     */
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (request != null && request.getUrl() != null) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }
        return super.shouldInterceptRequest(view, request);
    }

    /**
     * Prevents URL spoofing, intent redirection, and cross-site scripting vulnerabilities.
     */
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (request == null || request.getUrl() == null) return false;

        Uri uri = request.getUrl();
        String host = uri.getHost();
        String scheme = uri.getScheme();

        // Allow navigation within the secure local assets bundle
        if (TRUSTED_DOMAIN.equalsIgnoreCase(host)) {
            return false;
        }

        // Open external web links securely in external browser
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                browserIntent.setComponent(null);
                browserIntent.setSelector(null);
                context.startActivity(browserIntent);
            } catch (Exception e) {
                Log.w(TAG, "Cannot launch external browser for " + uri + ": " + e.getMessage());
            }
            return true;
        }

        // Block malicious or unexpected schemes (file://, javascript:, intent://, etc.)
        Log.w(TAG, "Blocked navigation to unapproved URI scheme: " + uri);
        return true;
    }

    /**
     * Google Play Security Requirement: NEVER call handler.proceed() on SSL errors.
     */
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        Log.e(TAG, "SSL Certificate Error intercepted: " + error.toString() + ". Aborting connection.");
        handler.cancel();
    }
}
