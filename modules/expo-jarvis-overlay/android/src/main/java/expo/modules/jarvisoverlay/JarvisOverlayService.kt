package expo.modules.jarvisoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.WindowManager
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Keeps the JARVIS orb drawn over every other app.
 *
 * A foreground service, because a plain service is killed within about a
 * minute of the app leaving the screen on Android 8+, and the orb has to
 * outlive the app for it to be worth having. The notification it requires
 * doubles as the off switch: "Hide" stops the service and removes the orb.
 *
 * Tapping the orb brings JARVIS to the front. Dragging moves it; releasing it
 * snaps it to the nearest screen edge so it never sits over the middle of
 * whatever the owner is doing.
 */
class JarvisOverlayService : Service() {

  companion object {
    const val ACTION_STOP = "expo.modules.jarvisoverlay.STOP"
    private const val CHANNEL_ID = "jarvis_orb"
    private const val NOTIFICATION_ID = 7417

    /** True between the orb being attached and removed. Read by isShowing(). */
    @Volatile
    var running: Boolean = false
      private set
  }

  private var windowManager: WindowManager? = null
  private var orb: JarvisOrbView? = null
  private var params: WindowManager.LayoutParams? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    // The permission can be revoked while the service is alive. Adding an
    // overlay window without it throws, so check every time rather than once.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      stopSelf()
      return START_NOT_STICKY
    }

    startAsForeground()
    if (orb == null) attachOrb()
    return START_STICKY
  }

  override fun onDestroy() {
    detachOrb()
    super.onDestroy()
  }

  private fun startAsForeground() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "JARVIS orb", NotificationManager.IMPORTANCE_MIN)
      channel.description = "Shown while the floating JARVIS orb is on screen."
      manager.createNotificationChannel(channel)
    }

    val stopIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, JarvisOverlayService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val hide = Notification.Action.Builder(
      Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
      "Hide orb",
      stopIntent,
    ).build()

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setContentTitle("JARVIS orb is on")
      .setContentText("Tap the orb to open JARVIS.")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .addAction(hide)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

  private fun attachOrb() {
    val manager = getSystemService(WINDOW_SERVICE) as WindowManager
    val size = dp(64)
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val layout = WindowManager.LayoutParams(
      size,
      size,
      type,
      // Not focusable: the orb must never steal the keyboard or a game's input
      // from the app underneath. Touches outside the orb pass straight through.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = resources.displayMetrics.widthPixels - size - dp(8)
      y = resources.displayMetrics.heightPixels / 3
    }

    val view = JarvisOrbView(this)
    view.contentDescription = "JARVIS"
    view.setOnTouchListener(DragOrTap(layout))

    manager.addView(view, layout)
    windowManager = manager
    orb = view
    params = layout
    running = true
  }

  private fun detachOrb() {
    val view = orb
    if (view != null) {
      try {
        windowManager?.removeView(view)
      } catch (alreadyRemoved: IllegalArgumentException) {
        // Already detached by the system; nothing left to remove.
      }
    }
    orb = null
    params = null
    running = false
  }

  private fun openJarvis() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    launch.putExtra("jarvis_orb_launch", true)
    // Starting an activity from the background is allowed here because the
    // app holds SYSTEM_ALERT_WINDOW, which Android lists as an exemption from
    // background-activity-start restrictions.
    startActivity(launch)
  }

  private inner class DragOrTap(private val layout: WindowManager.LayoutParams) : android.view.View.OnTouchListener {
    private val slop = ViewConfiguration.get(this@JarvisOverlayService).scaledTouchSlop
    private var downRawX = 0f
    private var downRawY = 0f
    private var startX = 0
    private var startY = 0
    private var dragging = false

    override fun onTouch(view: android.view.View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          startX = layout.x
          startY = layout.y
          dragging = false
          return true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downRawX
          val dy = event.rawY - downRawY
          if (!dragging && (abs(dx) > slop || abs(dy) > slop)) dragging = true
          if (dragging) {
            layout.x = startX + dx.roundToInt()
            layout.y = startY + dy.roundToInt()
            windowManager?.updateViewLayout(view, layout)
          }
          return true
        }
        MotionEvent.ACTION_UP -> {
          if (dragging) {
            snapToEdge(view)
          } else {
            view.performClick()
            openJarvis()
          }
          return true
        }
        MotionEvent.ACTION_CANCEL -> {
          if (dragging) snapToEdge(view)
          return true
        }
      }
      return false
    }

    private fun snapToEdge(view: android.view.View) {
      val screenWidth = resources.displayMetrics.widthPixels
      val screenHeight = resources.displayMetrics.heightPixels
      val middle = layout.x + layout.width / 2
      layout.x = if (middle < screenWidth / 2) dp(8) else screenWidth - layout.width - dp(8)
      layout.y = layout.y.coerceIn(dp(24), screenHeight - layout.height - dp(24))
      windowManager?.updateViewLayout(view, layout)
    }
  }
}
