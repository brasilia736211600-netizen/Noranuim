package expo.modules.noraview

import android.Manifest
import android.os.Message
import android.os.SystemClock
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
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
 * caches and media access are unavailable, so the earlier probe pattern could never
 * exercise those surfaces.
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
  // Runtime evidence: cookies and DOM storage stay profile-scoped.
  // ---------------------------------------------------------------------------

  @Test
  fun cookiesAndDomStorageStayProfileScoped() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-cookie-a"
    val b = "security-cookie-b"
    val base = server!!.url("/")
    try {
      assertTrue(bindProfile(a))
      assertTrue(bindProfile(b))

      instrumentation.runOnMainSync {
        ProfileStore.getInstance().getProfile(a)!!.cookieManager.setCookie(base, "profile=A; path=/")
        ProfileStore.getInstance().getProfile(b)!!.cookieManager.setCookie(base, "profile=B; path=/")
        ProfileStore.getInstance().getProfile(a)!!.cookieManager.flush()
        ProfileStore.getInstance().getProfile(b)!!.cookieManager.flush()
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

      val aCookie = jsCookie(wvA)
      val bCookie = jsCookie(wvB)
      assertTrue("profile A must see own cookie", aCookie.contains("profile=A"))
      assertTrue("profile B must see own cookie", bCookie.contains("profile=B"))
      assertFalse("profile A must not see profile B cookie", aCookie.contains("profile=B"))
      assertFalse("profile B must not see profile A cookie", bCookie.contains("profile=A"))
      assertNotEquals(aCookie, bCookie)

      var serviceWorkersDistinct = false
      var webStorageDistinct = false
      instrumentation.runOnMainSync {
        val store = ProfileStore.getInstance()
        val pa = store.getProfile(a)!!
        val pb = store.getProfile(b)!!
        serviceWorkersDistinct = pa.serviceWorkerController !== pb.serviceWorkerController
        webStorageDistinct = pa.webStorage !== pb.webStorage
      }
      assertTrue("service worker controllers must be profile-scoped", serviceWorkersDistinct)
      assertTrue("web storage must be profile-scoped", webStorageDistinct)
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
      assertTrue(bindProfile(a))
      assertTrue(bindProfile(b))

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
        assertProbe(wvA, "storageOp", "ok", "write", "cycle", i.toString())
        assertProbe(wvB, "storageOp", "ok", "write", "cycle", (i * 10).toString())
        assertProbe(wvA, "storageOp", i.toString(), "read", "cycle")
        assertProbe(wvB, "storageOp", (i * 10).toString(), "read", "cycle")
      }

      // Restart/restoration: destroying and recreating the WebViews (as an activity
      // restart does) must restore each profile's persisted content without leakage.
      cleanupWebViews()
      instrumentation.runOnMainSync {
        ProfileStore.getInstance().getProfile(a)!!.cookieManager.flush()
        ProfileStore.getInstance().getProfile(b)!!.cookieManager.flush()
      }

      val wvA2 = newProfileWebView(a)
      val wvB2 = newProfileWebView(b)
      loadPage(wvA2, server!!.url("/page"))
      loadPage(wvB2, server!!.url("/page"))

      assertProbe(wvA2, "idbOp", "A", "read", "profile")
      assertProbe(wvB2, "idbOp", "B", "read", "profile")
      assertProbe(wvA2, "cacheOp", "A-cache", "read", "/marker")
      assertProbe(wvB2, "cacheOp", "B-cache", "read", "/marker")
      assertProbe(wvB2, "storageOp", "30", "read", "cycle")
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
      assertTrue(bindProfile(a))
      assertTrue(bindProfile(b))

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
  // Runtime evidence: permission granting/denying is resolved per profile/WebView
  // and never leaks across profiles.
  // ---------------------------------------------------------------------------

  @Test
  fun permissionOutcomesArePerProfileAndDoNotLeak() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val a = "security-perm-a"
    val b = "security-perm-b"
    try {
      assertTrue(bindProfile(a))
      assertTrue(bindProfile(b))

      val clientA = PermissionsClient()
      val clientB = PermissionsClient()
      val wvA = newProfileWebView(a, clientA)
      val wvB = newProfileWebView(b, clientB)
      loadPage(wvA, server!!.url("/perm-page"))
      loadPage(wvB, server!!.url("/perm-page"))

      clientA.allow = true
      assertProbe(wvA, "requestAudio", "granted")
      assertEquals("profile A must resolve exactly one permission request", 1, clientA.requests.get())
      assertEquals(PermissionRequest.RESOURCE_AUDIO_CAPTURE, clientA.lastResource)
      assertEquals("profile A request must never appear on profile B", 0, clientB.requests.get())

      clientB.allow = false
      val denied = waitForResult(wvB, "requestAudio")
      assertTrue("profile B must be denied independently of profile A grant, got $denied", denied.startsWith("denied"))
      assertEquals("profile B must resolve exactly one permission request", 1, clientB.requests.get())
      assertEquals(PermissionRequest.RESOURCE_AUDIO_CAPTURE, clientB.lastResource)

      // Profile A's granted state must survive profile B's independent deny, and a
      // fresh identical request on A must still be granted.
      assertProbe(wvA, "requestAudio", "granted")
      val deniedAgain = waitForResult(wvB, "requestAudio")
      assertTrue("profile B must remain denied, got $deniedAgain", deniedAgain.startsWith("denied"))
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
      assertTrue(bindProfile(a))
      assertTrue(bindProfile(b))
      instrumentation.runOnMainSync {
        ProfileStore.getInstance().getProfile(a)!!.cookieManager.setCookie(base, "profile=A; path=/")
        ProfileStore.getInstance().getProfile(b)!!.cookieManager.setCookie(base, "profile=B; path=/")
        ProfileStore.getInstance().getProfile(a)!!.cookieManager.flush()
        ProfileStore.getInstance().getProfile(b)!!.cookieManager.flush()
      }

      val popupA = mutableListOf<WebView>()
      val popupB = mutableListOf<WebView>()
      val (wvA, clientA) = newPopupOpener(a, popupA)
      val (wvB, clientB) = newPopupOpener(b, popupB)
      loadPage(wvA, server!!.url("/popup-opener"), clientA)
      loadPage(wvB, server!!.url("/popup-opener"), clientB)

      assertProbe(wvA, "openPopup", "opened")
      assertProbe(wvB, "openPopup", "opened")

      waitForPopupVerdict(popupA, "A-only")
      waitForPopupVerdict(popupB, "B-only")

      // The popup created from profile A must still be scoped to A after B's popup
      // was created.
      waitForPopupVerdict(popupA, "A-only")
    } finally {
      cleanup(a, b)
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime evidence: missing/invalid/unsupported profiles fail closed instead of
  // silently mapping to the default or another profile.
  // ---------------------------------------------------------------------------

  @Test
  fun missingAndInvalidProfilesFailClosed() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    val store = ProfileStore.getInstance()
    try {
      val missingName = "definitely-missing-${System.nanoTime()}"
      var missing: androidx.webkit.Profile? = null
      instrumentation.runOnMainSync { missing = store.getProfile(missingName) }
      assertNull("a request for a missing profile must resolve to null, not to a default/global store", missing)

      // An invalid profile name must not bind a WebView and must not be resolvable,
      // so callers can only ever fail closed.
      val invalid = "Invalid Name!"
      assertFalse("an invalid profile name must fail closed", bindProfile(invalid))
      var invalidProfile: androidx.webkit.Profile? = null
      instrumentation.runOnMainSync { invalidProfile = store.getProfile(invalid) }
      assertNull("an invalid profile name must not materialize a profile", invalidProfile)
    } finally {
      cleanup()
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun bindProfile(name: String): Boolean {
    val store = ProfileStore.getInstance()
    var bound = true
    instrumentation.runOnMainSync {
      if (store.getProfile(name) != null) {
        return@runOnMainSync
      }
      val wv = WebView(context)
      bound = try {
        WebViewCompat.setProfile(wv, name)
        store.getProfile(name) != null
      } catch (e: Exception) {
        false
      } finally {
        runCatching { wv.destroy() }
      }
    }
    return bound
  }

  private fun newProfileWebView(profile: String, chrome: WebChromeClient? = null): WebView {
    var wv: WebView? = null
    instrumentation.runOnMainSync {
      wv = WebView(context)
      wv!!.settings.javaScriptEnabled = true
      wv!!.settings.domStorageEnabled = true
      WebViewCompat.setProfile(wv!!, profile)
      if (chrome != null) {
        wv!!.webChromeClient = chrome
      }
      created.add(wv!!)
    }
    return wv!!
  }

  private fun newPopupOpener(profile: String, popupOwner: MutableList<WebView>): Pair<WebView, TrackingClient> {
    var wv: WebView? = null
    var client: PopupOpenerClient? = null
    instrumentation.runOnMainSync {
      wv = WebView(context)
      wv!!.settings.javaScriptEnabled = true
      wv!!.settings.domStorageEnabled = true
      wv!!.settings.setSupportMultipleWindows(true)
      wv!!.settings.javaScriptCanOpenWindowsAutomatically = true
      WebViewCompat.setProfile(wv!!, profile)
      client = PopupOpenerClient(profile, popupOwner)
      wv!!.webViewClient = client
      created.add(wv!!)
    }
    return wv!! to client!!
  }

  private inner class PopupOpenerClient(
    private val profile: String,
    private val popupOwner: MutableList<WebView>,
  ) : TrackingClient() {
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
      popup.webViewClient = TrackingClient()
      (resultMsg.obj as WebView.WebViewTransport).webView = popup
      resultMsg.sendToTarget()
      popupOwner.add(popup)
      created.add(popup)
      return true
    }
  }

  private fun loadPage(wv: WebView, url: String, client: TrackingClient? = null) {
    val tracking = client ?: TrackingClient()
    instrumentation.runOnMainSync {
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

  private fun jsEval(wv: WebView, script: String): String? {
    val latch = CountDownLatch(1)
    var out: String? = null
    instrumentation.runOnMainSync {
      wv.evaluateJavascript(script) { value ->
        out = value
        latch.countDown()
      }
    }
    latch.await(15, TimeUnit.SECONDS)
    return out
  }

  private fun callProbe(wv: WebView, function: String, vararg args: String) {
    val quoted = args.joinToString(",") { "\"${it.escapeJs()}\"" }
    jsEval(wv, "window.__$function($quoted);")
  }

  private fun waitForResult(wv: WebView, function: String, vararg args: String): String {
    callProbe(wv, function, *args)
    val deadline = SystemClock.uptimeMillis() + 30_000
    while (SystemClock.uptimeMillis() < deadline) {
      val value = jsEval(wv, "window.__result")
      // evaluateJavascript returns JSON; a real string result is quoted, while the
      // JS `null` (the "pending" sentinel) is unquoted.
      if (value != null && value.startsWith("\"")) {
        return value.trim('"')
      }
      SystemClock.sleep(200)
    }
    hardFail("timed out waiting for __result from __$function on ${wv.url}")
  }

  private fun assertProbe(wv: WebView, function: String, expected: String, vararg args: String) {
    val actual = waitForResult(wv, function, *args)
    assertEquals("__$function(${args.joinToString(",")})", expected, actual)
  }

  private fun jsCookie(wv: WebView): String {
    callProbe(wv, "cookie")
    val deadline = SystemClock.uptimeMillis() + 10_000
    while (SystemClock.uptimeMillis() < deadline) {
      val value = jsEval(wv, "window.__result")
      if (value != null && value.startsWith("\"")) {
        return value.trim('"')
      }
      SystemClock.sleep(200)
    }
    hardFail("timed out reading document.cookie on ${wv.url}")
  }

  private fun waitForPopupVerdict(popups: List<WebView>, expected: String) {
    for (popup in popups) {
      val client = popup.webViewClient as? TrackingClient ?: continue
      val failure = client.waitForLoad()
      if (failure != null) {
        fail("popup failed to load: $failure")
      }
    }
    val deadline = SystemClock.uptimeMillis() + 20_000
    while (SystemClock.uptimeMillis() < deadline) {
      if (popups.isNotEmpty()) {
        val value = jsEval(popups.last(), "localStorage.getItem('popup-cookie-verdict')")
        if (value != null && value.startsWith("\"")) {
          val verdict = value.trim('"')
          if (verdict == expected) {
            return
          }
        }
      }
      SystemClock.sleep(200)
    }
    hardFail("popup never reached verdict $expected")
  }

  private fun cleanupWebViews() {
    instrumentation.runOnMainSync {
      created.forEach { runCatching { it.destroy() } }
      created.clear()
    }
  }

  private fun cleanup(vararg profiles: String) {
    instrumentation.runOnMainSync {
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

  private class PermissionsClient : WebChromeClient() {
    val requests = AtomicInteger(0)
    @Volatile var lastResource: String = ""
    @Volatile var allow = false

    override fun onPermissionRequest(request: PermissionRequest) {
      requests.incrementAndGet()
      lastResource = if (request.resources.isNotEmpty()) request.resources[0] else ""
      if (allow) {
        val granted = request.resources.filter { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }.toTypedArray()
        if (granted.isEmpty()) request.deny() else request.grant(granted)
      } else {
        request.deny()
      }
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
    const val PAGE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__result = null;
        window.__idbOp = function (write, key, value) {
          window.__result = null;
          var req = indexedDB.open('probe', 1);
          req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains('kv')) { req.result.createObjectStore('kv'); }
          };
          req.onerror = function () { window.__result = 'ERR:idb-open'; };
          req.onsuccess = function () {
            var db = req.result;
            if (write) {
              var tx = db.transaction('kv', 'readwrite');
              tx.objectStore('kv').put(value, key);
              tx.oncomplete = function () { window.__result = 'ok'; };
              tx.onerror = function () { window.__result = 'ERR:idb-write'; };
            } else {
              var tx = db.transaction('kv');
              var get = tx.objectStore('kv').get(key);
              get.onsuccess = function () { window.__result = String(get.result === undefined || get.result === null ? 'null' : get.result); };
              get.onerror = function () { window.__result = 'ERR:idb-read'; };
            }
          };
        };
        window.__cacheOp = function (write, key, value) {
          window.__result = null;
          if (typeof caches === 'undefined') { window.__result = 'ERR:no-caches'; return; }
          caches.open('probe').then(function (c) {
            if (write) {
              return c.put(key, new Response(String(value))).then(function () { return 'ok'; });
            }
            return c.match(key).then(function (r) { return r ? r.text() : ''; });
          }).then(function (v) { window.__result = String(v); })
            .catch(function () { window.__result = 'ERR:cache'; });
        };
        window.__storageOp = function (write, key, value) {
          window.__result = null;
          try {
            if (write) { localStorage.setItem(key, value); window.__result = 'ok'; }
            else { window.__result = String(localStorage.getItem(key)); }
          } catch (e) { window.__result = 'ERR:' + e.name; }
        };
        window.__cookie = function () {
          window.__result = null;
          try { window.__result = String(document.cookie); } catch (e) { window.__result = 'ERR:' + e.name; }
        };
      </script></body></html>
    """

    const val SW_PAGE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__result = null;
        window.__swOp = function (op, key) {
          window.__result = null;
          var p;
          if (op === 'init') {
            p = navigator.serviceWorker.register('/sw.js').then(function (reg) {
              return reg.ready.then(function () {
                return new Promise(function (resolve) {
                  var mc = new MessageChannel();
                  mc.port1.onmessage = function (e) { resolve('ok'); };
                  reg.active.postMessage({ type: 'init', key: key }, [ mc.port2 ]);
                });
              });
            });
          } else {
            p = navigator.serviceWorker.getRegistration().then(function (reg) {
              if (!reg || !reg.active) { return 'ERR:no-registration'; }
              return new Promise(function (resolve) {
                var mc = new MessageChannel();
                mc.port1.onmessage = function (e) { resolve('ping:' + e.data.value); };
                reg.active.postMessage({ type: 'ping' }, [ mc.port2 ]);
              });
            });
          }
          p.then(function (v) { window.__result = String(v); })
           .catch(function (e) { window.__result = 'ERR:' + (e && e.message || e); });
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

    const val PERM_PAGE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__result = null;
        window.__requestAudio = function () {
          window.__result = null;
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            window.__result = 'ERR:no-mediaDevices';
            return;
          }
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
              stream.getTracks().forEach(function (t) { t.stop(); });
              window.__result = 'granted';
            })
            .catch(function (e) {
              window.__result = 'denied:' + ((e && e.name) || 'unknown');
            });
        };
      </script></body></html>
    """

    const val POPUP_OPENER_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        window.__result = null;
        window.__openPopup = function () {
          window.__result = 'opening';
          var w = window.open('/popup-probe', '_blank');
          window.__result = w ? 'opened' : 'blocked';
        };
      </script></body></html>
    """

    const val POPUP_PROBE_HTML = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
        var c = document.cookie || '';
        var hasA = c.indexOf('profile=A') >= 0;
        var hasB = c.indexOf('profile=B') >= 0;
        var verdict = hasA && !hasB ? 'A-only'
          : hasB && !hasA ? 'B-only'
          : hasA && hasB ? 'A-and-B'
          : 'none';
        localStorage.setItem('popup-cookie-verdict', verdict);
        document.title = 'popup-' + verdict;
      </script></body></html>
    """
  }
}