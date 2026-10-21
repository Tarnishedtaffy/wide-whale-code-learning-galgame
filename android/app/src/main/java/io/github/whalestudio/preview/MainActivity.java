package io.github.whalestudio.preview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String PAGE = ORIGIN + "/assets/index.html";
    private static final int EXPORT_DOCUMENT = 31;
    private WebView webView;
    private String pendingExport;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16, 20, 22));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return insets;
            });
        }
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 20, 22));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.addJavascriptInterface(new FileExporter(), "WhaleAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !PAGE.equals(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (PAGE.equals(request.getUrl().toString())) {
                    try {
                        return new WebResourceResponse("text/html", "UTF-8", getAssets().open("index.html"));
                    } catch (IOException error) {
                        return response(500, "Missing asset", "Packaged page is unavailable.");
                    }
                }
                return response(403, "Forbidden", "Offline application");
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        webView.loadUrl(PAGE);
    }

    private WebResourceResponse response(int status, String reason, String body) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, null,
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    public final class FileExporter {
        @JavascriptInterface public void exportFile(String name, String content) {
            if (name == null || content == null) return;
            runOnUiThread(() -> {
                if (!PAGE.equals(webView.getUrl())) return;
                if (pendingExport != null) {
                    Toast.makeText(MainActivity.this, "请先完成当前文件的导出", Toast.LENGTH_SHORT).show();
                    return;
                }
                pendingExport = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[\\\\/\\p{Cntrl}]", "_"));
                try { startActivityForResult(intent, EXPORT_DOCUMENT); }
                catch (android.content.ActivityNotFoundException error) {
                    pendingExport = null;
                    Toast.makeText(MainActivity.this, "此设备没有可用的文件保存应用", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != EXPORT_DOCUMENT) return;
        String content = pendingExport;
        pendingExport = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) return;
        Uri destination = data.getData();
        try (OutputStream stream = getContentResolver().openOutputStream(destination, "wt")) {
            if (stream == null) throw new IOException("No output stream");
            stream.write(content.getBytes(StandardCharsets.UTF_8));
            Toast.makeText(this, "文件已导出", Toast.LENGTH_SHORT).show();
        } catch (IOException | SecurityException error) {
            Toast.makeText(this, "导出失败，请选择其他保存位置重试", Toast.LENGTH_LONG).show();
        }
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(() => { const d=document.querySelector('dialog[open]'); if(d){d.close();return true;} const c=document.getElementById('cards-peek'); if(c && c.getAttribute('aria-expanded')==='true'){document.getElementById('close-cards').click();return true;} const e=document.querySelector('[data-page=\"1\"]'); if(e&&!e.classList.contains('active')){e.click();return true;} return false; })()",
            handled -> { if (!"true".equals(handled)) finish(); });
    }

    @Override protected void onPause() {
        webView.evaluateJavascript("document.getElementById('save-button').click()", null);
        super.onPause();
    }

    @Override protected void onDestroy() {
        webView.removeJavascriptInterface("WhaleAndroid");
        webView.destroy();
        super.onDestroy();
    }
}
