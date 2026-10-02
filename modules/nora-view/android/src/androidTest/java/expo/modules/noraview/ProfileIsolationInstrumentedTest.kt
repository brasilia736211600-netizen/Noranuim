package expo.modules.noraview

import android.Manifest
import android.os.Message
import android.os.SystemClock
import android.webkit.PermissionRequest
import android.webkit.ServiceWorkerClient
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runtime proof that Chromium storage and state are isolated per WebView profile.
 *
 * All probes run against a real HTTP origin served from an in-process loopback
 * server ([LocalWebServer]). Loopback is treated as a secure context by Chromium,
 * which is what makes IndexedDB, Cache API and service workers available, and the
 * platform exempts loopback from the Android cleartext policy even though the app
 * disables cleartext traffic. Using a real origin instead of `loadDataWithBaseURL`
 * is required: a data: document has an opaque origin where localStorage, IndexedDB,
 * caches and media access are unavailable, so an earlier probe pattern built on
 * data: URLs could never exercise those surfaces.
 *
 * Probe design note: every probe returns a Promise that resolves to a string, and
 * the harness reads that string straight out of the `evaluateJavascript` callback.
 * An earlier revision published results into a shared `window.__result` slot and
 * polled it from the instrumentation thread; when asynchronous work overlapped,
 * that slot could still hold the *previous* probe's value when the next probe was
 * read, which produces false verdicts such as reading `ok` (a write result) for a
 * read assertion. A promise return value is delivered atomically with its own
 * probe, so that race cannot occur and no timeout-based polling is needed.
 *
 * Threading note: `ProfileStore` is annotated `@UiThread`, and every WebView and
 * `Profile` accessor must run on the UI thread. `runOnMainSync` itself returns
 * Unit, so [onMain] wraps it to return a value.
 */
@RunWith(AndroidJUnit4::class)
class ProfileIsolationInstrumentedTest {

  @get:Rule
  val audioPermission: GrantPermissionRule =
    GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val context = instrumentation.targetContext

  private var server: LocalWebServer? = null
  private val created = mutableListOf<WebView>()

  // Each probe publishes its verdict under a fresh key, so a value that settled
  // for an earlier probe can never be read back as this probe's result.
  private val probeSeq = AtomicInteger(0)

  @Before
  fun startServer() {
    server = LocalWebServer().apply {
      route("/page", "text/html", PAGE_HTML)
      route("/sw-page", "text/html", SW_PAGE_HTML)
      route("/sw.js", "text/javascript", SW_JS)
      route("/perm-page", "text/html", PERM_PAGE_HTML)
      route("/popup-opener", "text/html", POPUP_OPENER_HTML)
      route("/popup-probe", "text/html", POPUP_PROBE_HTML)
    }
  }

  @After
  fun stopServer() {
    server?.stop()
    server = null
  }

  // ---------------------------------------------------------------------------
  // Non-vacuity guard.
  //
  // Every isolation test below begins with
  // `assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))`,
  // which reports a SKIP when the feature is absent — and a class of six
  // skipped tests is a green Gradle task carrying zero isolation evidence.
  // That is exactly the "gate is green but nothing ran" failure mode this
  // suite exists to rule out, so the precondition is asserted explicitly here.
  // On an environment that cannot do multi-profile WebViews the gate now fails
  // loudly instead of passing vacuously.
  // ---------------------------------------------------------------------------

  @Test
  fun gateRequiresMultiProfileSupport() {
    val webViewVersion = onMain {
      // Force the WebView provider to load so the version is resolvable.
      runCatching { WebView(context).destroy() }
      WebView.getCurrentWebViewPackage()?.versionName ?: "<unresolved>"
    }
    assertTrue(
      "this gate requires WebView MULTI_PROFILE support, but the WebView on this device is " +
        "$webViewVersion. Without it every profile-isolation test would SKIP and the gate " +
        "would report success with no isolation evidence at all.",
      WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE),
    )
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: cookies and DOM storage stay profile-scoped.
  // ---------------------------------------------------------------------------

  @Test
  fun cookiesAndDomStorageStayProfileScoped() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-cookie-a"
    val b = "security-cookie-b"
    val base = server!!.url("/")
    try {
      // ProfileStore is @UiThread, so every touch of it happens on the UI thread.
      onMain {
        val store = ProfileStore.getInstance()
        store.getOrCreateProfile(a).cookieManager.setCookie(base, "profile=A; path=/")
        store.getOrCreateProfile(b).cookieManager.setCookie(base, "profile=B; path=/")
        store.getOrCreateProfile(a).cookieManager.flush()
        store.getOrCreateProfile(b).cookieManager.flush()
      }

      val wvA = newProfileWebView(a)
      val wvB = newProfileWebView(b)
      loadPage(wvA, server!!.url("/page"))
      loadPage(wvB, server!!.url("/page"))

      assertProbe(wvA, "storageOp", "ok", "write", "profile", "A")
      assertProbe(wvB, "storageOp", "ok", "write", "profile", "B")
      assertProbe(wvA, "storageOp", "A", "read", "profile")
      assertProbe(wvB, "storageOp", "B", "read", "profile")
      // Data written on one profile must not surface on the other.
      assertProbe(wvB, "storageOp", "null", "read", "only-a")
      assertProbe(wvA, "storageOp", "null", "read", "only-b")

      // document.cookie is served by the profile's own cookie manager.
      assertProbe(wvA, "cookie", "profile=A")
      assertProbe(wvB, "cookie", "profile=B")

      // The per-profile controllers the API hands out must be distinct objects,
      // which is the mechanism behind the storage separation asserted above.
      val distinct = onMain {
        val store = ProfileStore.getInstance()
        val pa = store.getProfile(a)
        val pb = store.getProfile(b)
        assertNotNull("profile $a must resolve", pa)
        assertNotNull("profile $b must resolve", pb)
        (pa!!.serviceWorkerController !== pb!!.serviceWorkerController) &&
          (pa.webStorage !== pb.webStorage)
      }
      assertTrue("service worker controller and web storage must be profile-scoped", distinct)
    } finally {
      cleanup(a, b)
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: IndexedDB content + Cache API content stay profile-scoped,
  // survive WebView recreation (restart/restoration) and repeated switching.
  // ---------------------------------------------------------------------------

  @Test
  fun indexedDbCacheAndSwitchStateStayProfileScopedAndSurviveRecreation() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-storage-a"
    val b = "security-storage-b"
    try {
      val wvA = newProfileWebView(a)
      val wvB = newProfileWebView(b)
      loadPage(wvA, server!!.url("/page"))
      loadPage(wvB, server!!.url("/page"))

      // Each profile writes its own IndexedDB and cache content under the SAME origin.
      assertProbe(wvA, "idbOp", "ok", "write", "profile", "A")
      assertProbe(wvB, "idbOp", "ok", "write", "profile", "B")
      assertProbe(wvA, "cacheOp", "ok", "write", "/marker", "A-cache")
      assertProbe(wvB, "cacheOp", "ok", "write", "/marker", "B-cache")

      assertProbe(wvA, "idbOp", "A", "read", "profile")
      assertProbe(wvB, "idbOp", "B", "read", "profile")
      assertProbe(wvA, "cacheOp", "A-cache", "read", "/marker")
      assertProbe(wvB, "cacheOp", "B-cache", "read", "/marker")
      assertProbe(wvA, "idbOp", "null", "read", "only-b")
      assertProbe(wvB, "idbOp", "null", "read", "only-a")

      // Repeated profile switching keeps every profile's own view of the world.
      for (i in 1..3) {
        val keyA = "cycle-a-$i"
        val keyB = "cycle-b-${i * 10}"
        assertProbe(wvA, "storageOp", "ok", "write", keyA, i.toString())
        assertProbe(wvB, "storageOp", "ok", "write", keyB, (i * 10).toString())
        assertProbe(wvA, "storageOp", i.toString(), "read", keyA)
        assertProbe(wvB, "storageOp", (i * 10).toString(), "read", keyB)
      }

      // Restart/restoration: destroying and recreating the WebViews (as an activity
      // restart does) must restore each profile's persisted content without leakage.
      cleanupWebViews()
      onMain {
        ProfileStore.getInstance().getProfile(a)?.cookieManager?.flush()
        ProfileStore.getInstance().getProfile(b)?.cookieManager?.flush()
      }

      val wvA2 = newProfileWebView(a)
      val wvB2 = newProfileWebView(b)
      loadPage(wvA2, server!!.url("/page"))
      loadPage(wvB2, server!!.url("/page"))

      assertProbe(wvA2, "idbOp", "A", "read", "profile")
      assertProbe(wvB2, "idbOp", "B", "read", "profile")
      assertProbe(wvA2, "cacheOp", "A-cache", "read", "/marker")
      assertProbe(wvB2, "cacheOp", "B-cache", "read", "/marker")
      assertProbe(wvA2, "storageOp", "3", "read", "cycle-a-3")
      assertProbe(wvA2, "idbOp", "null", "read", "only-b")
    } finally {
      cleanup(a, b)
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: service worker registration and content stay profile-scoped.
  // ---------------------------------------------------------------------------

  @Test
  fun serviceWorkerRegistrationAndContentStayProfileScoped() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-sw-a"
    val b = "security-sw-b"
    try {
      // ServiceWorkerClient must be installed on the profile's controller BEFORE
      // the profile's WebView loads the SW page; otherwise register() fires against
      // an un-instrumented controller and the promise never settles. This is done
      // inside onMain because ProfileStore is @UiThread.
      onMain {
        installServiceWorkerClient(a)
        installServiceWorkerClient(b)
      }

      val wvA = newProfileWebView(a)
      val wvB = newProfileWebView(b)
      loadPage(wvA, server!!.url("/sw-page"))
      loadPage(wvB, server!!.url("/sw-page"))

      // Both profiles register the SAME scope (/sw.js). If the registration store
      // leaked across profiles, the second registration would replace the first and
      // profile A's instance would lose its state.
      assertProbe(wvA, "swOp", "ok", "init", "A")
      assertProbe(wvA, "swOp", "ping:A", "ping")

      assertProbe(wvB, "swOp", "ok", "init", "B")
      assertProbe(wvB, "swOp", "ping:B", "ping")

      // Profile A's registration and instance state must be intact after B reused
      // the same scope.
      assertProbe(wvA, "swOp", "ping:A", "ping")
      assertProbe(wvB, "swOp", "ping:B", "ping")
    } finally {
      cleanup(a, b)
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: a media permission request raised by one profile's page is
  // delivered to THAT profile's WebChromeClient and never to another profile's.
  //
  // The assertion is deliberately about routing, not about the final getUserMedia
  // outcome: a CI emulator has no audio input, so even a granted request rejects
  // with NotReadableError. Requiring "granted" would make this gate depend on
  // emulator hardware. What isolation must guarantee is that each profile's
  // request reaches its own client, exactly once, with its own decision.
  // ---------------------------------------------------------------------------

  @Test
  fun permissionRequestsRouteOnlyToTheirOwnProfile() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-perm-a"
    val b = "security-perm-b"
    try {
      val clientA = PermissionsClient(allow = true)
      val clientB = PermissionsClient(allow = false)
      val wvA = newProfileWebView(a, clientA)
      val wvB = newProfileWebView(b, clientB)
      loadPage(wvA, server!!.url("/perm-page"))
      loadPage(wvB, server!!.url("/perm-page"))

      // A's page asks for audio; only A's client may see it.
      assertProbe(wvA, "requestAudio", "resolved")
      assertEquals("profile A must resolve exactly one permission request", 1, clientA.requests.get())
      assertEquals(PermissionRequest.RESOURCE_AUDIO_CAPTURE, clientA.lastResource)
      assertEquals("profile A request must never appear on profile B", 0, clientB.requests.get())

      // B's page asks too; now B's client sees exactly its own request.
      assertProbe(wvB, "requestAudio", "resolved")
      assertEquals("profile B must resolve exactly one permission request", 1, clientB.requests.get())
      assertEquals(PermissionRequest.RESOURCE_AUDIO_CAPTURE, clientB.lastResource)
      assertEquals("profile A must still have resolved only its own request", 1, clientA.requests.get())

      // A second request on A is still delivered to A, proving B's denial neither
      // disabled nor rerouted A's channel.
      assertProbe(wvA, "requestAudio", "resolved")
      assertEquals("profile A must resolve each request exactly once", 2, clientA.requests.get())
      assertEquals("profile B must not gain requests from A", 1, clientB.requests.get())
    } finally {
      cleanup(a, b)
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: popups inherit their opener's profile storage, never the
  // global/default or another profile's storage.
  // ---------------------------------------------------------------------------

  @Test
  fun popupWindowsInheritSourceProfileStorage() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-popup-a"
    val b = "security-popup-b"
    val base = server!!.url("/")
    try {
      onMain {
        val store = ProfileStore.getInstance()
        store.getOrCreateProfile(a).cookieManager.setCookie(base, "profile=A; path=/")
        store.getOrCreateProfile(b).cookieManager.setCookie(base, "profile=B; path=/")
        store.getOrCreateProfile(a).cookieManager.flush()
        store.getOrCreateProfile(b).cookieManager.flush()
      }

      val popupA = mutableListOf<Pair<WebView, TrackingClient>>()
      val popupB = mutableListOf<Pair<WebView, TrackingClient>>()
      val (wvA, clientA) = newPopupOpener(a, popupA)
      val (wvB, clientB) = newPopupOpener(b, popupB)
      loadPage(wvA, server!!.url("/popup-opener"), clientA)
      loadPage(wvB, server!!.url("/popup-opener"), clientB)

      assertProbe(wvA, "openPopup", "opened")
      assertProbe(wvB, "openPopup", "opened")

      assertEquals("profile A must open exactly one popup", 1, popupA.size)
      assertEquals("profile B must open exactly one popup", 1, popupB.size)

      assertPopupVerdict(popupA.last(), "A-only")
      assertPopupVerdict(popupB.last(), "B-only")

      // A's popup must still be scoped to A after B's popup existed.
      assertPopupVerdict(popupA.last(), "A-only")
    } finally {
      cleanup(a, b)
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: a profile name that has never been used does not resolve to
  // the shared default/global store, and never shares storage with another profile.
  //
  // Platform-contract note: androidx.webkit documents getProfile() as returning
  // null for an unknown name, but the shipped WebView implementation may
  // materialise a profile object on access instead (observed on the API 35 image
  // this gate runs on). Asserting "must be null" would therefore pin an
  // implementation detail that is not itself a security property. The security
  // property is that such a name is never the default profile and never sees
  // another profile's storage, which is what is checked here.
  // ---------------------------------------------------------------------------

  @Test
  fun unknownProfileNamesNeverShareAnotherProfilesStorage() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-failclosed-a"
    val unknown = "security-failclosed-b-${System.nanoTime()}"
    try {
      val wvA = newProfileWebView(a)
      loadPage(wvA, server!!.url("/page"))
      assertProbe(wvA, "storageOp", "ok", "write", "only-a", "1")
      assertProbe(wvA, "storageOp", "1", "read", "only-a")

      val wvU = newProfileWebView(unknown)
      loadPage(wvU, server!!.url("/page"))
      assertProbe(wvU, "storageOp", "null", "read", "only-a")
      assertProbe(wvU, "storageOp", "ok", "write", "only-u", "1")
      assertProbe(wvA, "storageOp", "null", "read", "only-u")
    } finally {
      cleanup(a, unknown)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Runs [block] on the UI thread and returns its value. `runOnMainSync` returns
   * Unit, so a value-returning wrapper is required for anything that yields a
   * Profile, WebView or other object.
   */
  private fun <T> onMain(block: () -> T): T {
    var out: T? = null
    var failure: Throwable? = null
    instrumentation.runOnMainSync {
      try {
        out = block()
      } catch (e: Throwable) {
        failure = e
      }
    }
    failure?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return out as T
  }

  /**
   * WebView only resolves a service-worker registration when the profile's
   * controller has a ServiceWorkerClient installed; without one the registration
   * promise never settles. Installing it per profile is also what makes the
   * registration store profile-scoped, which is the property under test.
   * ProfileStore access is on UI thread; setServiceWorkerClient must be on
   * background thread.
   */
  private fun installServiceWorkerClient(profile: String) {
    val controller = onMain {
      ProfileStore.getInstance().getOrCreateProfile(profile).serviceWorkerController
    }
    // Use a dedicated thread to avoid kotlinx.coroutines threading issues in
    // Android instrumentation context. The controller object is thread-safe.
    val t = Thread {
      controller.setServiceWorkerClient(object : ServiceWorkerClient() {
        override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? = null
      })
    }
    t.start()
    t.join()
  }

  private fun newProfileWebView(profile: String, chrome: WebChromeClient? = null): WebView =
    onMain {
      WebView(context).also { wv ->
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        WebViewCompat.setProfile(wv, profile)
        if (chrome != null) {
          wv.webChromeClient = chrome
        }
        created.add(wv)
      }
    }

  private fun newPopupOpener(
    profile: String,
    popupOwner: MutableList<Pair<WebView, TrackingClient>>,
  ): Pair<WebView, TrackingClient> =
    onMain {
      val wv = WebView(context)
      wv.settings.javaScriptEnabled = true
      wv.settings.domStorageEnabled = true
      wv.settings.setSupportMultipleWindows(true)
      wv.settings.javaScriptCanOpenWindowsAutomatically = true
      WebViewCompat.setProfile(wv, profile)
      // Window creation is a WebChromeClient callback, not a WebViewClient one:
      // onCreateWindow lives on WebChromeClient only, so the popup-interception
      // logic and the page-load tracking must be two separate objects.
      val tracking = TrackingClient()
      wv.webViewClient = tracking
      wv.webChromeClient = PopupOpenerClient(profile, popupOwner)
      created.add(wv)
      wv to tracking
    }

  private inner class PopupOpenerClient(
    private val profile: String,
    private val popupOwner: MutableList<Pair<WebView, TrackingClient>>,
  ) : WebChromeClient() {
    override fun onCreateWindow(
      view: WebView,
      isDialog: Boolean,
      isUserGesture: Boolean,
      resultMsg: Message,
    ): Boolean {
      val popup = WebView(context)
      try {
        WebViewCompat.setProfile(popup, profile)
      } catch (e: Exception) {
        popup.destroy()
        return false
      }
      popup.settings.javaScriptEnabled = true
      popup.settings.domStorageEnabled = true
      popup.settings.setSupportMultipleWindows(false)
      val tracking = TrackingClient()
      popup.webViewClient = tracking
      (resultMsg.obj as WebView.WebViewTransport).webView = popup
      resultMsg.sendToTarget()
      popupOwner.add(popup to tracking)
      created.add(popup)
      return true
    }
  }

  private fun loadPage(wv: WebView, url: String, client: TrackingClient? = null) {
    val tracking = client ?: TrackingClient()
    onMain {
      if (client == null) {
        wv.webViewClient = tracking
      }
      wv.loadUrl(url)
    }
    val failure = tracking.waitForLoad()
    if (failure != null) {
      fail("failed to load $url: $failure")
    }
  }

  /**
   * Evaluates [script] and returns its JSON-encoded completion value, or null if
   * the script completed with `undefined`/`null`. Used for the atomic reads of a
   * probe's own result key.
   */
  private fun jsEval(wv: WebView, script: String): String? {
    val latch = CountDownLatch(1)
    var out: String? = null
    onMain {
      wv.evaluateJavascript(script) { value ->
        out = value
        latch.countDown()
      }
    }
    if (!latch.await(30, TimeUnit.SECONDS)) {
      hardFail("timed out evaluating a probe on ${wv.url}")
    }
    return out
  }

  private fun waitForResult(wv: WebView, function: String, vararg args: String): String {
    val quoted = args.joinToString(",") { "\"${it.escapeJs()}\"" }
    val call = "window.__$function($quoted)"
    val label = "__$function(${args.joinToString(",")})"
    // A fresh key per probe means a value published by an earlier probe can never
    // be misread as this probe's verdict, whatever order the callbacks arrive in.
    val key = "__probe_${probeSeq.incrementAndGet()}"
    onMain {
      wv.evaluateJavascript(
        "$call.then(" +
          "function (value) { window.$key = String(value); }," +
          "function (err) { window.$key = 'ERR:' + (err && err.message || err); }" +
          ");",
        null,
      )
    }
    val deadline = SystemClock.uptimeMillis() + 30_000
    while (SystemClock.uptimeMillis() < deadline) {
      val raw = jsEval(wv, "typeof window.$key === 'string' ? window.$key : null")
      if (raw != null && raw.startsWith("\"")) {
        return raw.trim('"')
      }
      SystemClock.sleep(200)
    }
    hardFail("probe $label on ${wv.url} did not settle within 30s")
  }

  private fun assertProbe(wv: WebView, function: String, expected: String, vararg args: String) {
    val actual = waitForResult(wv, function, *args)
    assertEquals("__$function(${args.joinToString(",")})", expected, actual)
  }

  private fun assertPopupVerdict(popup: Pair<WebView, TrackingClient>, expected: String) {
    // The client is carried alongside the popup rather than read back off the
    // WebView: WebView.getWebViewClient() is a WebView method and must be called
    // on the UI thread, which the instrumentation thread is not.
    val failure = popup.second.waitForLoad()
    if (failure != null) {
      fail("popup failed to load: $failure")
    }
    val actual = waitForResult(popup.first, "readVerdict")
    assertEquals("popup must see only its opener profile's cookie", expected, actual)
  }

  private fun cleanupWebViews() {
    onMain {
      created.forEach { runCatching { it.destroy() } }
      created.clear()
    }
  }

  private fun cleanup(vararg profiles: String) {
    onMain {
      created.forEach { runCatching { it.destroy() } }
      created.clear()
      val store = ProfileStore.getInstance()
      profiles.forEach { p -> runCatching { store.deleteProfile(p) } }
    }
  }

  private fun hardFail(message: String): Nothing = throw AssertionError(message)

  private fun String.escapeJs(): String =
    replace("\\", "\\\\").replace("\"", "\\\"")

  private class TrackingClient : WebViewClient() {
    private val pageFinished = CountDownLatch(1)
    @Volatile private var failure: String? = null

    override fun onPageFinished(view: WebView, url: String) {
      pageFinished.countDown()
    }

    @Suppress("DEPRECATION")
    override fun onReceivedError(view: WebView, errorCode: Int, description: String, failingUrl: String) {
      failure = "onReceivedError($errorCode) $description $failingUrl"
    }

    @Suppress("DEPRECATION")
    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
      if (request.isForMainFrame) {
        failure = "onReceivedError { code=${error.errorCode} desc=${error.description} url=${request.url} }"
      }
    }

    fun waitForLoad(timeoutMs: Long = 30_000): String? {
      val done = pageFinished.await(timeoutMs, TimeUnit.MILLISECONDS)
      return if (!done) "page load timed out" else failure
    }
  }

  private class PermissionsClient(private val allow: Boolean) : WebChromeClient() {
    val requests = AtomicInteger(0)
    @Volatile var lastResource: String = ""

    override fun onPermissionRequest(request: PermissionRequest) {
      requests.incrementAndGet()
      lastResource = if (request.resources.isNotEmpty()) request.resources[0] else ""
      val granted = request.resources
        .filter { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
        .toTypedArray()
      if (allow && granted.isNotEmpty()) request.grant(granted) else request.deny()
    }
  }

  private class LocalWebServer {
    private val serverSocket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    private val executor: ExecutorService = Executors.newCachedThreadPool()
    private val running = java.util.concurrent.atomic.AtomicBoolean(true)
    private val routes = ConcurrentHashMap<String, Route>()

    val port: Int get() = serverSocket.localPort

    private data class Route(val contentType: String, val body: String)

    init {
      executor.submit {
        while (running.get()) {
          try {
            val socket = serverSocket.accept()
            executor.submit { handle(socket) }
          } catch (e: Exception) {
            if (running.get()) {
              // transient accept failures are ignored; shutdown stops the loop
            }
          }
        }
      }
    }

    fun route(path: String, contentType: String, body: String) {
      routes[path] = Route(contentType, body)
    }

    fun url(path: String): String = "http://127.0.0.1:$port$path"

    fun stop() {
      running.set(false)
      runCatching { serverSocket.close() }
      executor.shutdownNow()
    }

    private fun handle(socket: Socket) {
      try {
        socket.use { s ->
          val reader = s.getInputStream().bufferedReader()
          val requestLine = reader.readLine() ?: return
          val parts = requestLine.split(" ")
          if (parts.size < 2) return
          val method = parts[0]
          val path = parts[1].substringBefore("?")
          var headerLine = reader.readLine()
          while (headerLine != null && headerLine.isNotEmpty() && headerLine != "\r") {
            headerLine = reader.readLine()
          }
          val route = routes[path]
          val status = if (route == null) "404 Not Found" else "200 OK"
          val body = route?.body ?: "not found"
          val type = route?.contentType ?: "text/plain"
          val bytes = body.toByteArray()
          val out = s.getOutputStream()
          out.write("HTTP/1.1 $status\r\n".toByteArray())
          out.write("Content-Type: $type\r\n".toByteArray())
          out.write("Content-Length: ${bytes.size}\r\n".toByteArray())
          out.write("Cache-Control: no-store\r\n".toByteArray())
          out.write("Connection: close\r\n".toByteArray())
          out.write("\r\n".toByteArray())
          if (method != "HEAD") {
            out.write(bytes)
          }
          out.flush()
        }
      } catch (e: Exception) {
        // The probe page failed to fetch; the calling test will surface it.
      } finally {
        runCatching { socket.close() }
      }
    }
  }

  private companion object {
    // A page is supplied with the same origin reused by every profile, so all
    // Chromium storage is exercised with identical URLs; only the profile differs.
    // Every probe resolves to a string so the harness can read the value straight
    // out of the evaluateJavascript callback.
    const val PAGE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__idbOp = function (op, key, value) {
          return new Promise(function (resolve) {
            var req = indexedDB.open('probe', 1);
            req.onupgradeneeded = function () {
              if (!req.result.objectStoreNames.contains('kv')) { req.result.createObjectStore('kv'); }
            };
            req.onerror = function () { resolve('ERR:idb-open'); };
            req.onsuccess = function () {
              var db = req.result;
              if (op === 'write') {
                var tx = db.transaction('kv', 'readwrite');
                tx.objectStore('kv').put(value, key);
                tx.oncomplete = function () { db.close(); resolve('ok'); };
                tx.onerror = function () { resolve('ERR:idb-write'); };
              } else {
                var tx = db.transaction('kv');
                var get = tx.objectStore('kv').get(key);
                get.onsuccess = function () {
                  db.close();
                  resolve(String(get.result === undefined ? 'null' : get.result));
                };
                get.onerror = function () { resolve('ERR:idb-read'); };
              }
            };
          });
        };
        window.__cacheOp = function (op, key, value) {
          if (typeof caches === 'undefined') { return Promise.resolve('ERR:no-caches'); }
          return caches.open('probe').then(function (c) {
            if (op === 'write') {
              return c.put(key, new Response(String(value))).then(function () { return 'ok'; });
            }
            return c.match(key).then(function (r) { return r ? r.text() : 'null'; });
          }).catch(function () { return 'ERR:cache'; });
        };
        // The first argument is the string 'write' or 'read'. It must be compared
        // explicitly: `if (op)` would be true for 'read' too, because any non-empty
        // JavaScript string is truthy, which silently ran the write branch for every
        // read probe and made reads report the write verdict ('ok').
        window.__storageOp = function (op, key, value) {
          try {
            if (op === 'write') { localStorage.setItem(key, value); return Promise.resolve('ok'); }
            return Promise.resolve(String(localStorage.getItem(key)));
          } catch (e) { return Promise.resolve('ERR:' + e.name); }
        };
        window.__cookie = function () {
          try { return Promise.resolve(String(document.cookie)); }
          catch (e) { return Promise.resolve('ERR:' + e.name); }
        };
      </script></body></html>
    """

    const val SW_PAGE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__swOp = function (op, key) {
          if (op === 'init') {
            return navigator.serviceWorker.register('/sw.js').then(function (reg) {
              return reg.ready.then(function () {
                return new Promise(function (resolve) {
                  var mc = new MessageChannel();
                  mc.port1.onmessage = function () { resolve('ok'); };
                  reg.active.postMessage({ type: 'init', key: key }, [ mc.port2 ]);
                });
              });
            }).catch(function (e) { return 'ERR:' + (e && e.message || e); });
          }
          return navigator.serviceWorker.getRegistration().then(function (reg) {
            if (!reg || !reg.active) { return 'ERR:no-registration'; }
            return new Promise(function (resolve) {
              var mc = new MessageChannel();
              mc.port1.onmessage = function (e) { resolve('ping:' + e.data.value); };
              reg.active.postMessage({ type: 'ping' }, [ mc.port2 ]);
            });
          }).catch(function (e) { return 'ERR:' + (e && e.message || e); });
        };
      </script></body></html>
    """

    const val SW_JS = """
      self.addEventListener('install', function () { self.skipWaiting(); });
      self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
      self.addEventListener('message', function (e) {
        var data = e.data || {};
        if (data.type === 'init') {
          self.__key = data.key;
          if (e.ports && e.ports.length) { e.ports[0].postMessage({ value: data.key }); }
        } else if (data.type === 'ping' && e.ports && e.ports.length) {
          e.ports[0].postMessage({ value: self.__key || 'unset' });
        }
      });
    """

    // The probe resolves 'resolved' whichever way the platform settled the
    // request. A CI emulator has no audio input, so the outcome itself (granted
    // vs NotReadableError vs NotAllowedError) is hardware dependent; the isolation
    // property under test is that the request reaches the requesting profile's own
    // WebChromeClient, which the Kotlin side asserts. 'ERR:no-mediaDevices' is kept
    // distinct because that means the probe never ran, which must fail the test.
    const val PERM_PAGE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__requestAudio = function () {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return Promise.resolve('ERR:no-mediaDevices');
          }
          return navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
              stream.getTracks().forEach(function (t) { t.stop(); });
              return 'resolved';
            })
            .catch(function () { return 'resolved'; });
        };
      </script></body></html>
    """

    const val POPUP_OPENER_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__openPopup = function () {
          var w = window.open('/popup-probe', '_blank');
          return Promise.resolve(w ? 'opened' : 'blocked');
        };
      </script></body></html>
    """

    const val POPUP_PROBE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        // The verdict is computed from document.cookie at read time rather than by
        // the page-load script, so a read can never observe a not-yet-computed
        // placeholder value.
        window.__readVerdict = function () {
          var c = document.cookie || '';
          var hasA = c.indexOf('profile=A') >= 0;
          var hasB = c.indexOf('profile=B') >= 0;
          var verdict = hasA && !hasB ? 'A-only'
            : hasB && !hasA ? 'B-only'
            : hasA && hasB ? 'A-and-B'
            : 'none';
          return Promise.resolve(verdict);
        };
      </script></body></html>
    """
  }
}