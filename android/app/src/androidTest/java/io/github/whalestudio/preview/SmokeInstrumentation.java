package io.github.whalestudio.preview;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;

/** Device smoke test with real WebView, native touch and document export. */
public final class SmokeInstrumentation extends Instrumentation {
    private MainActivity activity;
    private WebView web;

    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        int resultCode = Activity.RESULT_OK;
        String original = null;
        try {
            phase("launch");
            activity = launch();
            web = findWeb(activity.findViewById(android.R.id.content));
            await("document.getElementById('code-input') !== null");
            original = js("document.getElementById('code-input').value");
            check("typeof WhaleAndroid.exportFile === 'function'", "native bridge");
            js("document.getElementById('code-input').value='name = \"APK\"\\nprint(\"Hello, \" + name + \"!\")';document.getElementById('code-input').dispatchEvent(new Event('input'));document.getElementById('save-button').click();document.getElementById('run-button').click();true");
            check("document.getElementById('terminal-output').textContent.includes('Hello, APK!')", "demo run");
            check("JSON.parse(localStorage.getItem('whale-studio-workspace-v1')).files['main.py'].includes('APK')", "saved file");

            // Reload the page to verify localStorage rather than only in-memory state.
            runOnMainSync(() -> web.reload());
            await("document.getElementById('code-input') && document.getElementById('code-input').value.includes('APK')");
            js("document.querySelector('[data-page=\"2\"]').click();document.getElementById('chat-input').value='unsent draft';true");
            await("(() => {const a=document.getElementById('assistant').getBoundingClientRect(),d=document.getElementById('deck').getBoundingClientRect();return Math.min(a.right,d.right)-Math.max(a.left,d.left)>a.width*.98;})()");
            js("document.getElementById('cards-peek').click();true");
            await("document.getElementById('assistant').classList.contains('drawer-open')");
            SystemClock.sleep(350);
            js("window.smokePointers=[]; ['pointerdown','pointermove','pointerup','pointercancel'].forEach(t=>document.addEventListener(t,e=>smokePointers.push([t,e.target.className,e.clientX,e.clientY,e.isPrimary,e.button]),true));true");
            swipeCard();
            await("document.getElementById('card-position').textContent.includes('第 2 张')");
            SystemClock.sleep(400);
            js("document.querySelector('.flashcard[data-depth=\"0\"]').click();true");
            check("document.querySelector('.flashcard[data-depth=\"0\"]').getAttribute('aria-pressed')==='true'", "card flip");
            js("document.getElementById('close-cards').click();true");
            check("document.getElementById('chat-input').value==='unsent draft'", "chat draft survives");
            phase("export");
            testExport();
            result.putString("stream", "PASS: offline launch, bridge, run, saved reload, native swipe, flip, draft preservation, document export\n");
        } catch (Exception | AssertionError error) {
            result.putString("stream", "FAIL: " + error + "\n");
            try { result.putString("stream", result.getString("stream") + js("JSON.stringify({pointers:window.smokePointers,viewport:[innerWidth,innerHeight],scroll:document.getElementById('deck').scrollLeft,open:document.getElementById('assistant').className,card:document.getElementById('card-position').textContent})") + "\n"); }
            catch (Exception diagnosticError) { result.putString("stream", result.getString("stream") + diagnosticError + "\n"); }
            resultCode = Activity.RESULT_CANCELED;
        } finally {
            if (original != null && web != null) {
                try { js("document.querySelector('[data-page=\"1\"]').click();document.getElementById('code-input').value=" + original + ";document.getElementById('code-input').dispatchEvent(new Event('input'));document.getElementById('save-button').click();true"); }
                catch (Exception ignored) { }
            }
        }
        finish(resultCode, result);
    }

    private MainActivity launch() {
        Intent intent = new Intent(getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return (MainActivity) startActivitySync(intent);
    }

    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWeb(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String js(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> output = new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript(script, value -> { output.set(value); latch.countDown(); }));
        if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("JavaScript timeout");
        return output.get();
    }

    private void check(String condition, String label) throws Exception {
        if (!"true".equals(js(condition))) throw new AssertionError(label);
    }

    private void await(String condition) throws Exception {
        for (int i = 0; i < 100; i++) {
            if ("true".equals(js(condition))) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("Timed out: " + condition);
    }

    private void swipeCard() throws Exception {
        JSONArray bounds = new JSONArray(js("(() => {const r=document.querySelector('.flashcard[data-depth=\"0\"]').getBoundingClientRect();return [r.x+r.width*.8,r.y+r.height*.5,r.x+r.width*.2,innerWidth];})()"));
        float scale = web.getWidth() / (float) bounds.getDouble(3);
        int[] location = new int[2];
        runOnMainSync(() -> web.getLocationOnScreen(location));
        float start = location[0] + (float) bounds.getDouble(0) * scale;
        float end = location[0] + (float) bounds.getDouble(2) * scale;
        float y = location[1] + (float) bounds.getDouble(1) * scale;
        long down = SystemClock.uptimeMillis();
        sendPointerSync(MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, start, y, 0));
        for (int i = 1; i <= 12; i++) {
            SystemClock.sleep(16);
            sendPointerSync(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE, start+(end-start)*i/12, y, 0));
        }
        sendPointerSync(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, end, y, 0));
    }

    private void testExport() throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, "whale-smoke-export.txt");
        values.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
        Uri file = getTargetContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        phase("export URI ready");
        if (file == null) throw new AssertionError("export URI");
        AtomicInteger launches = new AtomicInteger();
        ActivityMonitor monitor = new ActivityMonitor() {
            @Override public ActivityResult onStartActivity(Intent intent) {
                if (!Intent.ACTION_CREATE_DOCUMENT.equals(intent.getAction())) return null;
                if (!"text/plain".equals(intent.getType())) throw new AssertionError("export MIME type");
                launches.incrementAndGet();
                return new ActivityResult(Activity.RESULT_OK, new Intent().setData(file));
            }
        };
        addMonitor(monitor);
        try {
            js("document.querySelector('[data-page=\"0\"]').click();document.getElementById('download-button').click();true");
            for (int i = 0; i < 50 && launches.get() == 0; i++) SystemClock.sleep(100);
            if (launches.get() != 1) throw new AssertionError("document chooser launch");
            phase("export intent intercepted");
            SystemClock.sleep(250);
            try (InputStream input = getTargetContext().getContentResolver().openInputStream(file)) {
                String content = new String(input.readAllBytes(), StandardCharsets.UTF_8);
                if (!content.contains("Hello, ")) throw new AssertionError("export content");
            }
        } finally {
            removeMonitor(monitor);
            getTargetContext().getContentResolver().delete(file, null, null);
        }
    }

    private void phase(String text) {
        Bundle update = new Bundle(); update.putString("stream", "smoke: " + text + "\n"); sendStatus(0,update);
    }
}
