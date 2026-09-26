package expo.modules.jarvisoverlay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing controls for the floating orb.
 *
 * Nothing here assumes the overlay permission is granted. `show()` returns
 * false instead of starting a service that would immediately fail, and the
 * owner is sent to Android's own settings screen to grant it — Android does
 * not allow an app to grant it to itself.
 */
class ExpoJarvisOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoJarvisOverlay")

    Function("canDrawOverlays") {
      val context = context() ?: return@Function false
      canDraw(context)
    }

    Function("openOverlaySettings") {
      val context = context() ?: return@Function false
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }

    Function("show") {
      val context = context() ?: return@Function false
      if (!canDraw(context)) return@Function false
      val intent = Intent(context, JarvisOverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    }

    Function("hide") {
      val context = context() ?: return@Function false
      context.stopService(Intent(context, JarvisOverlayService::class.java))
      true
    }

    Function("isShowing") {
      JarvisOverlayService.running
    }
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext

  private fun canDraw(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
}
