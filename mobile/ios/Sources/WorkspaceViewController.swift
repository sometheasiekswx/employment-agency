import SafariServices
import UIKit
import WebKit

final class WorkspaceViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, SFSafariViewControllerDelegate {
    private let workspace = WorkspaceOrigin(
        address: Bundle.main.object(forInfoDictionaryKey: "WorkspaceOrigin") as? String ?? ""
    )
    private let statusLabel = UILabel()
    private let retry = UIButton(type: .system)
    private let loading = UIActivityIndicatorView(style: .medium)
    private let webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "EmploymentAgencyMobile/1"
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        return WKWebView(frame: .zero, configuration: config)
    }()
    private var lastPage: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        var button = UIButton.Configuration.borderedProminent()
        button.title = "Try again"
        retry.configuration = button
        retry.addTarget(self, action: #selector(loadWorkspace), for: .touchUpInside)

        let status = UIStackView(arrangedSubviews: [loading, statusLabel, retry])
        status.axis = .vertical
        status.alignment = .center
        status.spacing = 16

        view.addSubview(webView)
        view.addSubview(status)
        webView.translatesAutoresizingMaskIntoConstraints = false
        status.translatesAutoresizingMaskIntoConstraints = false
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            status.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            status.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
            status.leadingAnchor.constraint(greaterThanOrEqualTo: safe.leadingAnchor, constant: 24),
            status.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -24),
        ])
        loadWorkspace()
    }

    @objc private func loadWorkspace() {
        guard let url = lastPage ?? workspace?.startURL else {
            showError("This build needs a workspace HTTPS address.")
            retry.isHidden = true
            return
        }

        webView.isHidden = true
        statusLabel.text = "Connecting to your workspace…"
        statusLabel.isHidden = false
        retry.isHidden = true
        loading.startAnimating()
        webView.load(URLRequest(url: url))
    }

    private func showError(_ message: String = "Couldn’t open your workspace. Check Tailscale and try again.") {
        loading.stopAnimating()
        webView.isHidden = true
        statusLabel.text = message
        statusLabel.isHidden = false
        retry.isHidden = false
        UIAccessibility.post(notification: .screenChanged, argument: statusLabel)
    }

    private func openSource(for action: WKNavigationAction) {
        guard let workspace, let url = action.request.url,
              action.navigationType == .linkActivated, action.sourceFrame.isMainFrame,
              workspace.contains(action.sourceFrame.securityOrigin),
              workspace.canOpenInBrowser(url), presentedViewController == nil else { return }

        let browser = SFSafariViewController(url: url)
        browser.dismissButtonStyle = .done
        browser.delegate = self
        present(browser, animated: true)
    }

    func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        controller.dismiss(animated: true)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url, let workspace else {
            decisionHandler(.cancel)
            return
        }

        guard let target = action.targetFrame else {
            // Only the UI delegate can present a new window; it validates the opener.
            decisionHandler(.allow)
            return
        }

        if !target.isMainFrame {
            let allowed = workspace.contains(url) || url.scheme == "blob" || url.absoluteString == "about:blank"
            decisionHandler(allowed ? .allow : .cancel)
        } else if workspace.contains(url) {
            lastPage = url
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated {
                openSource(for: action)
            } else if webView.isHidden {
                showError()
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        openSource(for: action)
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard frame.isMainFrame, workspace?.contains(frame.securityOrigin) == true,
              presentedViewController == nil else {
            completionHandler(false)
            return
        }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor response: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if response.isForMainFrame {
            guard let url = response.response.url, workspace?.contains(url) == true,
                  (response.response as? HTTPURLResponse).map({ $0.statusCode < 400 }) == true else {
                decisionHandler(.cancel)
                showError()
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading.stopAnimating()
        statusLabel.isHidden = true
        retry.isHidden = true
        webView.isHidden = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        self.webView(webView, didFail: navigation, withError: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showError()
    }
}
