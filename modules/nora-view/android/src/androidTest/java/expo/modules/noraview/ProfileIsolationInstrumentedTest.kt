package expo.modules.noraview

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ProfileIsolationInstrumentedTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val context = instrumentation.targetContext

  @Test
  fun profilesKeepCookiesAndWebStorageIndependent() {
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))

    val first = "security-test-a"
    val second = "security-test-b"
    val origin = "https://profile-isolation.test/"
    val latch = CountDownLatch(1)
    var firstCookie = ""
    var secondCookie = ""
    var firstStorage = ""
    var secondStorage = ""
    var serviceWorkersDistinct = false
    var webStorageDistinct = false

    instrumentation.runOnMainSync {
      val store = ProfileStore.getInstance()
      store.deleteProfile(first)
      store.deleteProfile(second)

      val firstWebView = WebView(context)
      val secondWebView = WebView(context)
      WebViewCompat.setProfile(firstWebView, first)
      WebViewCompat.setProfile(secondWebView, second)

      firstWebView.settings.javaScriptEnabled = true
      firstWebView.settings.domStorageEnabled = true
      secondWebView.settings.javaScriptEnabled = true
      secondWebView.settings.domStorageEnabled = true

      store.getProfile(first)!!.cookieManager.setCookie(origin, "profile=A")
      store.getProfile(second)!!.cookieManager.setCookie(origin, "profile=B")
      store.getProfile(first)!!.cookieManager.flush()
      store.getProfile(second)!!.cookieManager.flush()

      firstWebView.loadDataWithBaseURL(
        origin,
        "<script>localStorage.setItem('profile','A');document.title='A';</script>",
        "text/html",
        "UTF-8",
        null,
      )
      secondWebView.loadDataWithBaseURL(
        origin,
        "<script>localStorage.setItem('profile','B');document.title='B';</script>",
        "text/html",
        "UTF-8",
        null,
      )

      Handler(Looper.getMainLooper()).postDelayed({
        firstWebView.evaluateJavascript("localStorage.getItem('profile')") { value ->
          firstStorage = value.trim('"')
          firstWebView.evaluateJavascript("document.cookie") { cookie ->
            firstCookie = cookie.trim('"')
            secondWebView.evaluateJavascript("localStorage.getItem('profile')") { secondValue ->
              secondStorage = secondValue.trim('"')
              secondWebView.evaluateJavascript("document.cookie") { secondValueCookie ->
                secondCookie = secondValueCookie.trim('"')
                firstWebView.destroy()
                secondWebView.destroy()
                latch.countDown()
              }
            }
          }
        }
      }, 1500)
    }

    assertTrue("profile isolation JS probe timed out", latch.await(10, TimeUnit.SECONDS))
    assertEquals("A", firstStorage)
    assertEquals("B", secondStorage)
    assertTrue(firstCookie.contains("profile=A"))
    assertTrue(secondCookie.contains("profile=B"))
    assertNotEquals(firstCookie, secondCookie)

    instrumentation.runOnMainSync {
      val store = ProfileStore.getInstance()
      val firstProfile = store.getProfile(first)!!
      val secondProfile = store.getProfile(second)!!
      serviceWorkersDistinct = firstProfile.serviceWorkerController !== secondProfile.serviceWorkerController
      webStorageDistinct = firstProfile.webStorage !== secondProfile.webStorage
      store.deleteProfile(first)
      store.deleteProfile(second)
    }

    assertTrue("service worker controllers must be profile-scoped", serviceWorkersDistinct)
    assertTrue("web storage must be profile-scoped", webStorageDistinct)
  }
}
