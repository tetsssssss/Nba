package com.nbauniverse.manager.rebuild;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;

/** Locally packaged HTML, not a dependency on the public Netlify URL at runtime. */
public final class MainActivity extends Activity {
    private static final String TAG = "NBAUniverse";
    private static final String HOME = "https://appassets.androidplatform.net/assets/www/index.html#/start";
    private WebView webView;
    private FrameLayout root;
    private final int background = Color.rgb(8, 17, 31);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        root = new FrameLayout(this);
        root.setBackgroundColor(background);
        setContentView(root);
        startGame();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void startGame() {
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView = new WebView(this);
        webView.setBackgroundColor(background);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setUserAgentString(settings.getUserAgentString() + " NBAUniverseAndroid/1.0");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Log.e(TAG, "Main document: " + error.getDescription());
                    runOnUiThread(() -> showError());
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR)
                    Log.e(TAG, "JS " + message.sourceId() + ":" + message.lineNumber() + " " + message.message());
                return true;
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.loadUrl(HOME);
    }

    private void showError() {
        if (isFinishing()) return;
        LinearLayout alert = new LinearLayout(this);
        alert.setOrientation(LinearLayout.VERTICAL);
        alert.setGravity(Gravity.CENTER);
        alert.setPadding(32, 32, 32, 32);
        alert.setBackgroundColor(background);
        TextView message = new TextView(this);
        message.setText(R.string.page_error);
        message.setTextColor(Color.WHITE);
        message.setTextSize(17);
        message.setGravity(Gravity.CENTER);
        alert.addView(message);
        Button retry = new Button(this);
        retry.setText(R.string.try_again);
        retry.setOnClickListener(v -> { root.removeView(alert); if (webView != null) webView.loadUrl(HOME); });
        alert.addView(retry);
        root.addView(alert, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }
    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }
    @Override
    protected void onDestroy() {
        if (webView != null) { root.removeView(webView); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
