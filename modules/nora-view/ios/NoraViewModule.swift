import ExpoModulesCore
import WebKit
import Translation
import SwiftUI

let VIEW_HOSTS = [
    "bsky.app",
    "www.linkedin.com",
    "www.instagram.com",
    "chat.reddit.com",
    "old.reddit.com",
    "www.reddit.com",
    "www.threads.com",
    "www.tiktok.com",
    "www.tumblr.com",
    "id.vk.com",
    "login.vk.com",
    "login.vk.ru",
    "m.vk.com",
    "vk.com",
    "x.com"
]

let TRACKING_PARAMS: Set<String> = [
  "utm_source",
  "utm_medium",
  "utm_name",
  "utm_term",
  "utm_content",
  "igsh",
  "xmt"
]

// Hosts where Google runs WebView-detection for OAuth.
let GOOGLE_AUTH_HOSTS: Set<String> = ["accounts.google.com", "accounts.youtube.com"]

// Masks WebView-only fingerprints that Google's sign-in checks. Mirrors the
// Android shim in modules/nora-view/android. Self-gates on hostname because
// WKUserScript has no per-origin scoping.
let OAUTH_SHIM_SCRIPT = """
  (function() {
    var host = location.hostname;
    if (host !== 'accounts.google.com' && host !== 'accounts.youtube.com') return;
    try {
      Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; }, configurable: true });
    } catch (e) {}
    try {
      if (!window.chrome) { window.chrome = {}; }
      if (!window.chrome.runtime) { window.chrome.runtime = {}; }
      if (!window.chrome.app) { window.chrome.app = { isInstalled: false }; }
      if (!window.chrome.csi) { window.chrome.csi = function() { return {}; }; }
      if (!window.chrome.loadTimes) { window.chrome.loadTimes = function() { return {}; }; }
    } catch (e) {}
  })();
"""

func installGoogleOAuthShim(_ controller: WKUserContentController) {
  let script = WKUserScript(source: OAUTH_SHIM_SCRIPT, injectionTime: .atDocumentStart, forMainFrameOnly: false)
  controller.addUserScript(script)
}

let INTERNAL_SCHEMES: Set<String> = [
  "about",
  "blob",
  "data",
  "file",
  "http",
  "https",
  "javascript",
  "nora"
]

public class NoraViewModule: Module {
  private var clipText = ""
  private var translationCoordinator: AnyObject?
  private var translationHost: UIViewController?

  public func definition() -> ModuleDefinition {
    Name("NoraView")

    Events("log")

    OnStartObserving {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.onPasteboardChanged),
        name: UIPasteboard.changedNotification,
        object: nil
      )
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(
        self,
        name: UIPasteboard.changedNotification,
        object: nil
      )
    }

    Function("setSettings") { (settings: NoraSettings) in
      NouController.shared.settings = settings
    }

    // On the main queue, and awaited by the caller: the per-site switch reloads
    // the page as soon as this resolves, and the reload must not outrun the
    // document start scripts the new exceptions are reinstalled into.
    AsyncFunction("setBlocklistExcludedHosts") { (hosts: String) in
      NouController.shared.setBlocklistExcludedHosts(hosts)
    }.runOnQueue(.main)

    Function("setBlocklist") { (blocklist: NoraBlocklist) in
      NouController.shared.setBlocklist(blocklist)
    }

    AsyncFunction("reloadBlocklistFromDisk") { (enabled: Bool, revision: Int) -> Bool in
      NouController.shared.reloadBlocklistFromDisk(enabled: enabled, revision: revision)
    }

    AsyncFunction("reloadBlocklistFromSourceFiles") { (enabled: Bool, revision: Int) -> Bool in
      NouController.shared.reloadBlocklistFromSourceFiles(enabled: enabled, revision: revision)
    }

    Function("setLocaleStrings") { (v: [String: Any]) in
      for (key, value) in v {
        if let strValue = value as? String {
          NouController.shared.i18nStrings[key] = strValue
        }
      }
    }

    AsyncFunction("clearProfileData") { (profile: String, promise: Promise) in
      NoraView.clearProfileData(profile, promise: promise)
    }

    AsyncFunction("clearHostData") { (profile: String, host: String, promise: Promise) in
      NoraView.clearHostData(profile, host: host, promise: promise)
    }

    AsyncFunction("getCookies") { (url: String, profile: String?, promise: Promise) in
      guard let parsed = URL(string: url), let host = parsed.host else {
        promise.resolve("")
        return
      }
      DispatchQueue.main.async {
        NoraView.getCookies(profile: profile ?? "default", host: host) { value in
          promise.resolve(value)
        }
      }
    }

    AsyncFunction("getProfileCookies") { (profile: String, promise: Promise) in
      DispatchQueue.main.async {
        NoraView.getProfileCookies(profile: profile) { cookies in
          promise.resolve(cookies)
        }
      }
    }

    AsyncFunction("openExternalUrl") { (url: String) -> Bool in
      guard let target = URL(string: url) else {
        return false
      }
      guard UIApplication.shared.canOpenURL(target) else {
        return false
      }
      UIApplication.shared.open(target)
      return true
    }

    AsyncFunction("translateText") { (text: String, targetLanguage: String, promise: Promise) in
      guard #available(iOS 18.0, *) else {
        promise.reject("translation_unavailable", "Translation requires iOS 18 or later")
        return
      }
      Task { @MainActor in
        let coordinator = self.translationCoordinatorForCurrentOS()
        self.installTranslationHostIfNeeded(coordinator: coordinator)
        coordinator.start(text: text, targetLanguage: targetLanguage, promise: promise)
      }
    }

    AsyncFunction("getTranslationSupportedLanguages") { () async -> [String] in
      guard #available(iOS 18.0, *) else {
        return []
      }
      return await LanguageAvailability().supportedLanguages.map(\.minimalIdentifier)
    }

    View(NoraView.self) {
      Prop("scriptOnStart") { (view: NoraView, script: String) in
        view.setScriptOnStart(script)
      }

      Prop("scriptOnDocumentStart") { (view: NoraView, script: String) in
        view.setScriptOnDocumentStart(script)
      }

      Prop("useragent") { (view: NoraView, ua: String) in
        view.userAgent = ua
        view.webView.customUserAgent = ua
      }

      Prop("profile") { (view: NoraView, profile: String) in
        view.setProfile(profile)
      }

      Prop("textZoom") { (view: NoraView, zoom: Int) in
        view.setTextZoom(zoom)
      }

      // Debug-only parity with Android's BuildConfig.DEBUG gate:
      // on Android (NoraViewModule.kt:350) the body runs only in Debug builds;
      // here the Prop body is #if DEBUG so Release builds compile it out.
      // The Prop itself stays registered (JS still sends inspectable from three
      // call sites) and becomes a no-op in Release, matching Android behavior.
      Prop("inspectable") { (view: NoraView, inspectable: Bool) in
        #if DEBUG
        view.setInspectable(inspectable)
        #endif
      }

      Prop("pullToRefresh") { (view: NoraView, enabled: Bool) in
        view.setPullToRefresh(enabled)
      }

      Events("onLoad", "onMessage")

      AsyncFunction("download") { (view: NoraView, url: String, fileName: String?) in
          view.download(url: url, fileName: fileName, mimeType: nil)
      }

      AsyncFunction("executeJavaScript") { (view: NoraView, script: String, promise: Promise) in
        view.webView.evaluateJavaScript(script) { result, error in
          if let error = error {
            promise.reject(error)
          } else {
             if let str = result as? String {
                 promise.resolve(str)
             } else {
                 promise.resolve(String(describing: result ?? "null"))
             }
          }
        }
      }

      AsyncFunction("goBack") { (view: NoraView) in
        if view.webView.canGoBack {
          view.webView.goBack()
        }
      }

      AsyncFunction("canGoBack") { (view: NoraView) in
        view.webView.canGoBack
      }

      AsyncFunction("goForward") { (view: NoraView) in
        if view.webView.canGoForward {
          view.webView.goForward()
        }
      }

      AsyncFunction("loadUrl") { (view: NoraView, url: String) in
        view.load(url: url)
      }

      // Argument order must match the JS call site: saveFile(content, fileName, mimeType).
      AsyncFunction("saveFile") { (view: NoraView, content: String, fileName: String, mimeType: String?) in
        view.saveFile(content: content, fileName: fileName, mimeType: mimeType)
      }
    }
  }

  @available(iOS 18.0, *)
  @MainActor
  private func translationCoordinatorForCurrentOS() -> AppleTranslationCoordinator {
    if let coordinator = translationCoordinator as? AppleTranslationCoordinator {
      return coordinator
    }
    let coordinator = AppleTranslationCoordinator()
    translationCoordinator = coordinator
    return coordinator
  }

  @available(iOS 18.0, *)
  @MainActor
  private func installTranslationHostIfNeeded(coordinator: AppleTranslationCoordinator) {
    guard translationHost == nil else { return }
    guard let windowScene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
          let root = windowScene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
      return
    }
    let host = UIHostingController(rootView: AppleTranslationTaskView(coordinator: coordinator))
    host.view.backgroundColor = .clear
    host.view.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
    root.addChild(host)
    root.view.addSubview(host.view)
    host.didMove(toParent: root)
    translationHost = host
  }

  @objc
  private func onPasteboardChanged() {
    // Consent gate FIRST (privacy): on iOS 14+ reading UIPasteboard.general.string
    // from another app triggers a system 'pasted from' banner even if we do not
    // rewrite; fail-closed default=false means no read happens until the user
    // opts in. Parity with Android's gate at NoraViewModule.kt:117.
    if !NouController.shared.settings.clipboardTrackingConsent {
      return
    }

    guard let text = UIPasteboard.general.string, !text.isEmpty else {
      return
    }
    if clipText == text {
      return
    }

    guard let url = URL(string: text), let host = url.host else {
      return
    }

    if VIEW_HOSTS.contains(host) {
      let cleanUrl = removeTrackingParams(urlStr: text)
      if cleanUrl != text {
        clipText = cleanUrl
        UIPasteboard.general.string = cleanUrl
        // Ensure the notice fires on the main thread and before the pasteboard
        // write becomes user-visible; if no presentable window exists we skip
        // the rewrite entirely (prevents silent clipboard mutation without notice).
        showTrackingStrippedNoticeIfPresentable(cleanUrl: cleanUrl)
      }
    }
  }

  // Main-thread coordinator: the listener can fire on any thread (NotificationCenter
  // delivers on the posting thread), but settings is a shared mutable struct and
  // UIKit/pasteboard APIs require main-thread affinity. All access to settings,
  // the pasteboard, and UI is sequenced on the main queue.
  private func showTrackingStrippedNoticeIfPresentable(cleanUrl: String) {
    DispatchQueue.main.async {
      // Find a presentable key window across all connected scenes; multi-scene
      // apps may have scenes in different states (.foregroundActive vs
      // .foregroundInactive). We only rewrite + notify if at least one scene
      // has a key window that is actually visible to the user.
      let presentableWindow = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow && $0.windowLevel == .normal && !$0.isHidden }
      guard let window = presentableWindow else {
        // No window we can show a banner on — revert the pasteboard write so
        // the user's clipboard is not silently rewritten without notice.
        UIPasteboard.general.string = self.clipText
        self.clipText = cleanUrl
        return
      }

      let tag = 0x4e4f5241
      window.viewWithTag(tag)?.removeFromSuperview()
      let label = UILabel()
      label.tag = tag
      label.isUserInteractionEnabled = false
      label.text = "Tracking parameters removed from copied URL"
      label.font = .systemFont(ofSize: 14, weight: .medium)
      label.textColor = .white
      label.backgroundColor = UIColor.black.withAlphaComponent(0.85)
      label.textAlignment = .center
      label.layer.cornerRadius = 8
      label.layer.masksToBounds = true
      label.numberOfLines = 0
      label.translatesAutoresizingMaskIntoConstraints = false
      window.addSubview(label)
      NSLayoutConstraint.activate([
        label.centerXAnchor.constraint(equalTo: window.centerXAnchor),
        label.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: -32),
        label.leadingAnchor.constraint(greaterThanOrEqualTo: window.leadingAnchor, constant: 24),
        label.trailingAnchor.constraint(lessThanOrEqualTo: window.trailingAnchor, constant: -24),
        label.widthAnchor.constraint(lessThanOrEqualTo: window.widthAnchor, constant: -48)
      ])
      label.alpha = 0
      UIView.animate(withDuration: 0.2, animations: { label.alpha = 1 }) { _ in
        UIView.animate(withDuration: 0.3, delay: 1.8, options: [], animations: { label.alpha = 0 }) { _ in
          label.removeFromSuperview()
        }
      }
    }
  }

  private func removeTrackingParams(urlStr: String) -> String {
    guard let url = URL(string: urlStr),
          var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return urlStr
    }

    guard let queryItems = components.queryItems else {
      return urlStr
    }

    let filteredQueryItems = queryItems.filter { !TRACKING_PARAMS.contains($0.name) }

    if filteredQueryItems.count == queryItems.count {
      return urlStr
    }

    components.queryItems = filteredQueryItems.isEmpty ? nil : filteredQueryItems

    return components.url?.absoluteString ?? urlStr
  }
    
  func log(_ msg: String) {
      sendEvent("log", [
          "msg": msg
      ])
  }

  required public init(appContext: AppContext) {
      super.init(appContext: appContext)
      NouController.shared.logFn = self.log
  }
}

@available(iOS 18.0, *)
@MainActor
private final class AppleTranslationCoordinator: ObservableObject {
  @Published var configuration: TranslationSession.Configuration?
  private var text = ""
  private var promise: Promise?

  func start(text: String, targetLanguage: String, promise: Promise) {
    self.promise?.reject("translation_cancelled", "A newer translation request replaced this one")
    self.text = text
    self.promise = promise
    configuration = TranslationSession.Configuration(source: nil, target: Locale.Language(identifier: targetLanguage))
  }

  func translate(using session: TranslationSession) async {
    guard let promise else { return }
    do {
      var sourceLanguage = ""
      let translated = try await text.split(separator: "\n", omittingEmptySubsequences: false)
        .asyncMap { line in
          guard !line.trimmingCharacters(in: .whitespaces).isEmpty else { return "" }
          let response = try await session.translate(String(line))
          sourceLanguage = response.sourceLanguage.minimalIdentifier
          return response.targetText
        }
        .joined(separator: "\n")
      promise.resolve(["text": translated, "sourceLanguage": sourceLanguage])
    } catch {
      promise.reject("translation_failed", error.localizedDescription)
    }
    self.promise = nil
    configuration = nil
  }
}

@available(iOS 18.0, *)
private extension Sequence {
  func asyncMap<T>(_ transform: (Element) async throws -> T) async throws -> [T] {
    var results: [T] = []
    for element in self {
      try await results.append(transform(element))
    }
    return results
  }
}

@available(iOS 18.0, *)
private struct AppleTranslationTaskView: View {
  @ObservedObject var coordinator: AppleTranslationCoordinator

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .translationTask(coordinator.configuration) { session in
        await coordinator.translate(using: session)
      }
  }
}
