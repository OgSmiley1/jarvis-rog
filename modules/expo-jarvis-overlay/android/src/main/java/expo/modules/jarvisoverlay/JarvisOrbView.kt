package expo.modules.jarvisoverlay

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.View
import android.view.animation.LinearInterpolator

/**
 * The floating orb itself: a small arc reactor drawn with plain Canvas calls.
 *
 * Deliberately a native View, not React. Rendering React inside a system
 * overlay needs a second React root and its own JS lifecycle, which would
 * roughly double the app's memory while the orb sits idle over a game. This
 * is a few hundred bytes of drawing state and one animator.
 *
 * Colours match the in-app HUD (components/theme.ts accent #66E3FF).
 */
class JarvisOrbView(context: Context) : View(context) {

  private val accent = Color.parseColor("#66E3FF")
  private val deep = Color.parseColor("#03080B")

  private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = accent
  }
  private val corePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val backPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.FILL
    color = deep
  }

  private var pulse = 0f

  private val animator = ValueAnimator.ofFloat(0f, 1f).apply {
    duration = 2600
    repeatCount = ValueAnimator.INFINITE
    repeatMode = ValueAnimator.REVERSE
    interpolator = LinearInterpolator()
    addUpdateListener {
      pulse = it.animatedValue as Float
      invalidate()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // Respect the system animator scale: when the owner turns animations off,
    // Android reports a zero duration scale and the animator does not run.
    animator.start()
  }

  override fun onDetachedFromWindow() {
    animator.cancel()
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val radius = minOf(width, height) / 2f

    // Dark disc so the orb stays legible over any app, light or dark.
    canvas.drawCircle(cx, cy, radius * 0.96f, backPaint)

    // Outer ring.
    ringPaint.strokeWidth = radius * 0.07f
    ringPaint.alpha = 150
    canvas.drawCircle(cx, cy, radius * 0.86f, ringPaint)

    // Inner ring.
    ringPaint.strokeWidth = radius * 0.05f
    ringPaint.alpha = 230
    canvas.drawCircle(cx, cy, radius * 0.62f, ringPaint)

    // Breathing core.
    val coreRadius = radius * (0.34f + 0.06f * pulse)
    corePaint.shader = RadialGradient(
      cx,
      cy,
      coreRadius,
      intArrayOf(Color.WHITE, accent, Color.argb(40, 102, 227, 255)),
      floatArrayOf(0f, 0.55f, 1f),
      Shader.TileMode.CLAMP,
    )
    canvas.drawCircle(cx, cy, coreRadius, corePaint)
  }
}
