package expo.modules.thermalstatus

import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridges android.os.PowerManager.getCurrentThermalStatus() (API 29+), the
 * OS's own throttling verdict. Requires no permission. Below API 29, or when
 * the system service is unavailable, this reports null rather than a guess —
 * JARVIS's runtime planner treats an absent reading as "not measured", never
 * as a cool, unconstrained device.
 */
class ExpoThermalStatusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoThermalStatus")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    }

    Function("getCurrentThermalStatus") {
      currentThermalStatus()
    }
  }

  private fun currentThermalStatus(): Int? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    val reactContext = appContext.reactContext ?: return null
    val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      ?: return null
    return powerManager.currentThermalStatus
  }
}
