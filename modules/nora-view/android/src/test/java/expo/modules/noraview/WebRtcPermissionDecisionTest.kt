package expo.modules.noraview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The WebView asks for camera/microphone through a page's getUserMedia, which
 * arrives at `onPermissionRequest` before Android has resolved anything. The
 * view used to grant the request in the same breath as asking for the runtime
 * permission, so the page was told it had the stream even when the user went
 * on to deny it.
 *
 * The grant has to be deferred until the runtime permission result is known.
 * That decision is pure logic, so it lives here where it can be tested without
 * an Activity.
 */
class WebRtcPermissionDecisionTest {
  @Test
  fun grantsRequestedResourcesWhenEveryPermissionIsGranted() {
    assertEquals(
      listOf(PermissionResource.audioCapture, PermissionResource.videoCapture),
      resolveWebRtcPermissionGrant(
        requested = setOf(PermissionResource.audioCapture, PermissionResource.videoCapture),
        granted = setOf(PermissionResource.audioCapture, PermissionResource.videoCapture),
      ),
    )
  }

  @Test
  fun deniesEverythingWhenTheUserDeclinesTheRuntimePermission() {
    assertEquals(
      emptyList<PermissionResource>(),
      resolveWebRtcPermissionGrant(
        requested = setOf(PermissionResource.audioCapture),
        granted = emptySet(),
      ),
    )
  }

  // A page asking for both when only the microphone was allowed must get only
  // the microphone: granting the camera it was refused hands out a stream the
  // user declined.
  @Test
  fun grantsOnlyTheResourcesWhosePermissionsWereGranted() {
    assertEquals(
      listOf(PermissionResource.audioCapture),
      resolveWebRtcPermissionGrant(
        requested = setOf(PermissionResource.audioCapture, PermissionResource.videoCapture),
        granted = setOf(PermissionResource.audioCapture),
      ),
    )
  }

  // Preserve what the page asked for, in the order it asked, so the granted
  // list is the page's own request narrowed rather than a reordered rebuild.
  @Test
  fun preservesThePagesRequestedOrder() {
    assertEquals(
      listOf(PermissionResource.videoCapture, PermissionResource.audioCapture),
      resolveWebRtcPermissionGrant(
        requested = listOf(PermissionResource.videoCapture, PermissionResource.audioCapture).toSet(),
        granted = setOf(PermissionResource.audioCapture, PermissionResource.videoCapture),
      ),
    )
  }

  @Test
  fun deniesWhenNothingWasRequested() {
    assertEquals(
      emptyList<PermissionResource>(),
      resolveWebRtcPermissionGrant(requested = emptySet(), granted = setOf(PermissionResource.audioCapture)),
    )
  }
}

/**
 * A `<input type="file">` on a page is answered by launching the platform
 * chooser. Returning `true` from `onShowFileChooser` tells the WebView the
 * chooser is up, so with no Activity to launch it into the page's file input
 * would never resolve. The chooser can only honestly be reported as launched
 * when there is somewhere to launch it.
 */
class FileChooserLaunchDecisionTest {
  @Test
  fun reportsLaunchedOnlyWhenAnActivityIsAvailable() {
    assertTrue(shouldReportFileChooserLaunched(activityAvailable = true))
    assertFalse(shouldReportFileChooserLaunched(activityAvailable = false))
  }
}
