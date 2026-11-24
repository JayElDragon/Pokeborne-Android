package com.jayeldragon.pokeborne;

import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Pokeborne running in a full-screen WebView, every file served from the APK (no internet needed). */
public class MainActivity extends Activity {
    static final String TAG = "Pokeborne";
    static final String HOST = "appassets.androidplatform.net";
    static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png"); MIME.put("webp", "image/webp"); MIME.put("ico", "image/x-icon");
        MIME.put("svg", "image/svg+xml"); MIME.put("glb", "model/gltf-binary"); MIME.put("bin", "application/octet-stream");
        MIME.put("woff2", "font/woff2"); MIME.put("ttf", "font/ttf"); MIME.put("m4a", "audio/mp4");
        MIME.put("mp3", "audio/mpeg"); MIME.put("ogg", "audio/ogg"); MIME.put("mp4", "video/mp4");
    }

    WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        applyRefresh(savedHz());

        WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(0xFF07080D);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.addJavascriptInterface(new PortBridge(), "AndroidPort");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return serve(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !HOST.equals(req.getUrl().getHost());
            }
        });
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
        if (state == null || web.restoreState(state) == null) web.loadUrl("https://" + HOST + "/");
    }

    /** The game renders one frame per display refresh: at the Odin's 120 Hz the GPU ran flat out (fan high).
     *  Default 60 Hz; 120 Hz is an option (Home screen button) and android_port.js then lowers the render
     *  resolution so the GPU load stays close to the 60 Hz one. Picks the closest mode at the same resolution. */
    int savedHz() { return getSharedPreferences("port", MODE_PRIVATE).getInt("hz", 60); }

    void applyRefresh(int hz) {
        if (Build.VERSION.SDK_INT < 23) return;
        android.view.Display d = getWindowManager().getDefaultDisplay();
        android.view.Display.Mode cur = d.getMode(), best = null;
        for (android.view.Display.Mode m : d.getSupportedModes()) {
            if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
            if (best == null || Math.abs(m.getRefreshRate() - hz) < Math.abs(best.getRefreshRate() - hz)) best = m;
        }
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        if (best != null) lp.preferredDisplayModeId = best.getModeId();
        lp.preferredRefreshRate = hz;
        getWindow().setAttributes(lp);
        Log.i(TAG, "Display mode " + (best != null ? best.getRefreshRate() + " Hz" : "unchanged"));
    }

    /** window.AndroidPort: refresh-rate option used by android_port.js. */
    class PortBridge {
        @JavascriptInterface public int getHz() { return savedHz(); }

        @JavascriptInterface public void setHz(int hz) {
            int v = hz >= 90 ? 120 : 60;
            getSharedPreferences("port", MODE_PRIVATE).edit().putInt("hz", v).commit();
            runOnUiThread(() -> applyRefresh(v));
        }
    }

    WebResourceResponse serve(Uri u) {
        if (!HOST.equals(u.getHost())) return blocked();
        String path = u.getPath();
        if (path == null || path.isEmpty()) path = "/";
        if (path.endsWith("/")) path += "index.html";
        if (path.contains("..")) return notFound();
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open("www" + path);
            WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") ? "utf-8" : null, in);
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            Log.w(TAG, "Missing in APK: " + path);
            return notFound();
        }
    }

    WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8",
                new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    /** Online-only services (telemetry, account) answer offline at once instead of waiting on a timeout. */
    WebResourceResponse blocked() {
        WebResourceResponse r = notFound();
        r.setStatusCodeAndReasonPhrase(503, "Offline");
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        r.setResponseHeaders(h);
        return r;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        // Android turns stick movement into fallback D-pad arrows; the game reads the stick
        // through the Gamepad API, so these would count every move twice.
        if ((event.getFlags() & KeyEvent.FLAG_FALLBACK) != 0 && (code == KeyEvent.KEYCODE_DPAD_UP
                || code == KeyEvent.KEYCODE_DPAD_DOWN || code == KeyEvent.KEYCODE_DPAD_LEFT
                || code == KeyEvent.KEYCODE_DPAD_RIGHT)) {
            return true;
        }
        // Back = Escape (pause / close menus) instead of leaving the game.
        if (code == KeyEvent.KEYCODE_BACK) {
            web.dispatchKeyEvent(new KeyEvent(event.getAction(), KeyEvent.KEYCODE_ESCAPE));
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    void hideBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); hideBars(); }
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
