package app.employmentagency.mobile;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
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
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsService;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.stream.Collectors;

public final class MainActivity extends ComponentActivity {
    private final WorkspaceOrigin workspace = WorkspaceOrigin.fromAddress(BuildConfig.WORKSPACE_ORIGIN);
    private FrameLayout root;
    private WebView webView;
    private LinearLayout status;
    private TextView message;
    private Button retry;
    private ProgressBar loading;
    private Uri lastPage;
    private boolean failed;
    private ValueCallback<Uri[]> fileResult;

    private final ActivityResultLauncher<Intent> chooseFile = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                if (fileResult != null) {
                    fileResult.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(
                            result.getResultCode(), result.getData()));
                    fileResult = null;
                }
            });

    private final OnBackPressedCallback webBack = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            webView.goBack();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        updateSystemBars();
        root = new FrameLayout(this);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets padding = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
            return insets;
        });
        setContentView(root);
        getOnBackPressedDispatcher().addCallback(this, webBack);
        createStatus();
        if (workspace == null) {
            showError(R.string.missing_workspace, false);
            return;
        }

        createWebView();
        showLoading();
        Bundle history = savedInstanceState == null ? null : savedInstanceState.getBundle("workspaceHistory");
        if (history == null || webView.restoreState(history) == null) loadWorkspace();
    }

    private void updateSystemBars() {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        var bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark);
        bars.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        updateSystemBars();
    }

    private void createStatus() {
        status = new LinearLayout(this);
        status.setOrientation(LinearLayout.VERTICAL);
        status.setGravity(Gravity.CENTER);
        int inset = Math.round(24 * getResources().getDisplayMetrics().density);
        status.setPadding(inset, inset, inset, inset);

        loading = new ProgressBar(this);
        message = new TextView(this);
        message.setGravity(Gravity.CENTER);
        message.setTextAppearance(android.R.style.TextAppearance_Material_Body1);
        message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        retry = new Button(this);
        retry.setText(R.string.try_again);
        retry.setOnClickListener(view -> loadWorkspace());

        status.addView(loading);
        status.addView(message);
        status.addView(retry);
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));
    }

    private void createWebView() {
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        // An ordinary target=_blank link reaches the main-frame navigation
        // delegate without creating a second workspace WebView.
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " EmploymentAgencyMobile/1");
        webView.setWebViewClient(new WorkspaceClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                String page = view.getUrl();
                if (page == null || !workspace.contains(Uri.parse(page))) return false;
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                try {
                    chooseFile.launch(params.createIntent());
                } catch (ActivityNotFoundException ignored) {
                    fileResult.onReceiveValue(null);
                    fileResult = null;
                }
                return true;
            }
        });
        root.addView(webView, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    private void loadWorkspace() {
        if (webView == null) createWebView();
        showLoading();
        webView.loadUrl((lastPage == null ? workspace.startUrl : lastPage).toString());
    }

    private void showLoading() {
        failed = false;
        webView.setVisibility(View.INVISIBLE);
        status.setVisibility(View.VISIBLE);
        loading.setVisibility(View.VISIBLE);
        retry.setVisibility(View.GONE);
        message.setText(R.string.connecting);
    }

    private void showError(int text, boolean canRetry) {
        failed = true;
        if (webView != null) webView.setVisibility(View.INVISIBLE);
        status.setVisibility(View.VISIBLE);
        loading.setVisibility(View.GONE);
        retry.setVisibility(canRetry ? View.VISIBLE : View.GONE);
        message.setText(text);
    }

    private void openSource(Uri url) {
        var browsers = getPackageManager()
                .queryIntentServices(new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION), 0)
                .stream()
                .map(result -> result.serviceInfo.packageName)
                .distinct()
                .collect(Collectors.toList());
        String provider = CustomTabsClient.getPackageName(this, browsers);
        if (provider != null) {
            CustomTabsIntent tab = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .setSendToExternalDefaultHandlerEnabled(false)
                    .build();
            tab.intent.setPackage(provider);
            try {
                tab.launchUrl(this, url);
                return;
            } catch (ActivityNotFoundException ignored) {
                // The selected browser may have been removed or disabled.
            }
        }

        new AlertDialog.Builder(this)
                .setMessage(R.string.custom_tab_unavailable)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(R.string.open_in_browser, (dialog, choice) -> openInBrowser(url))
                .show();
    }

    private void openInBrowser(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, R.string.browser_unavailable, Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            Bundle history = new Bundle();
            webView.saveState(history);
            outState.putBundle("workspaceHistory", history);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        destroyWebView();
        if (fileResult != null) fileResult.onReceiveValue(null);
        super.onDestroy();
    }

    private void destroyWebView() {
        if (webView == null) return;
        root.removeView(webView);
        webView.destroy();
        webView = null;
        webBack.setEnabled(false);
    }

    private final class WorkspaceClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri target = request.getUrl();
            if (!request.isForMainFrame()) return !workspace.allowsFrame(target);

            boolean sameOrigin = workspace.contains(target);
            String path = target.getPath();
            boolean document = sameOrigin && path != null
                    && (path.startsWith("/files/") || path.startsWith("/history/files/"));
            if (sameOrigin && !(document && request.hasGesture())) return false;

            Uri opener = view.getUrl() == null ? Uri.EMPTY : Uri.parse(view.getUrl());
            if (request.hasGesture() && !request.isRedirect() && workspace.contains(opener)
                    && workspace.canOpenInBrowser(target)) {
                openSource(target);
            } else if (!sameOrigin && view.getVisibility() != View.VISIBLE) {
                showError(R.string.workspace_unavailable, true);
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // The navigation callback does not see every request, such as POST.
            if (!request.isForMainFrame() || workspace.contains(request.getUrl())) return null;
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(),
                    new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            Uri target = Uri.parse(url);
            if (!workspace.contains(target)) {
                view.stopLoading();
                showError(R.string.workspace_unavailable, true);
                return;
            }
            lastPage = target;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!failed && workspace.contains(Uri.parse(url))) {
                status.setVisibility(View.GONE);
                view.setVisibility(View.VISIBLE);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError(R.string.workspace_unavailable, true);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) showError(R.string.workspace_unavailable, true);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            webBack.setEnabled(view.canGoBack());
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            destroyWebView();
            showError(R.string.workspace_unavailable, true);
            return true;
        }
    }
}
