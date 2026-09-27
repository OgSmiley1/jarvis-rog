package expo.modules.jarvisphone

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import android.provider.CallLog
import android.provider.ContactsContract
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What JARVIS can read and do on the phone, each behind its own Android
 * permission. Every read checks its permission first and fails with
 * "PERMISSION_DENIED:<name>" so JARVIS can say exactly what to allow, instead
 * of returning an empty list that sounds like "you have no messages".
 *
 * Nothing here sends a message by itself: texting opens the SMS app with the
 * recipient and words filled in, and the owner presses Send.
 */
class ExpoJarvisPhoneModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoJarvisPhone")

    Function("hasPermission") { permission: String ->
      val context = context() ?: return@Function false
      context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("findContacts") { query: String, limit: Int ->
      val context = requireGranted(Manifest.permission.READ_CONTACTS)
      val results = mutableListOf<Map<String, Any?>>()
      val seen = HashSet<String>()
      context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER,
          ContactsContract.CommonDataKinds.Phone.TYPE,
        ),
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
        arrayOf("%$query%"),
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC",
      )?.use { cursor ->
        while (cursor.moveToNext() && results.size < limit) {
          val name = cursor.getString(0) ?: continue
          val number = cursor.getString(1) ?: continue
          val key = name + "|" + number.filter { it.isDigit() }.takeLast(9)
          if (!seen.add(key)) continue
          val type = ContactsContract.CommonDataKinds.Phone.getTypeLabel(context.resources, cursor.getInt(2), "").toString()
          results.add(mapOf("name" to name, "number" to number, "type" to type))
        }
      }
      results
    }

    // Opens the dialler with the number filled in. The owner presses Call:
    // JARVIS never places a call by itself (owner's decision, 26 Sep 2026).
    Function("placeCall") { number: String ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      "dialer"
    }

    AsyncFunction("recentMessages") { limit: Int ->
      val context = requireGranted(Manifest.permission.READ_SMS)
      val results = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("address", "body", "date", "read"),
        null,
        null,
        "date DESC",
      )?.use { cursor ->
        while (cursor.moveToNext() && results.size < limit) {
          val address = cursor.getString(0) ?: ""
          results.add(
            mapOf(
              "from" to (contactName(context, address) ?: address),
              "body" to (cursor.getString(1) ?: ""),
              "date" to cursor.getLong(2).toDouble(),
              "read" to (cursor.getInt(3) == 1),
            ),
          )
        }
      }
      results
    }

    AsyncFunction("recentCalls") { limit: Int ->
      val context = requireGranted(Manifest.permission.READ_CALL_LOG)
      val results = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION),
        null,
        null,
        "${CallLog.Calls.DATE} DESC",
      )?.use { cursor ->
        while (cursor.moveToNext() && results.size < limit) {
          val number = cursor.getString(0) ?: ""
          val kind = when (cursor.getInt(2)) {
            CallLog.Calls.INCOMING_TYPE -> "incoming"
            CallLog.Calls.OUTGOING_TYPE -> "outgoing"
            CallLog.Calls.MISSED_TYPE -> "missed"
            CallLog.Calls.REJECTED_TYPE -> "rejected"
            CallLog.Calls.BLOCKED_TYPE -> "blocked"
            else -> "other"
          }
          results.add(
            mapOf(
              "name" to (cursor.getString(1)?.takeIf { it.isNotBlank() } ?: number),
              "number" to number,
              "kind" to kind,
              "date" to cursor.getLong(3).toDouble(),
              "seconds" to cursor.getLong(4).toDouble(),
            ),
          )
        }
      }
      results
    }

    AsyncFunction("calendarEvents") { startMs: Double, endMs: Double, limit: Int ->
      val context = requireGranted(Manifest.permission.READ_CALENDAR)
      val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
        ContentUris.appendId(it, startMs.toLong())
        ContentUris.appendId(it, endMs.toLong())
      }.build()
      val results = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(
        uri,
        arrayOf(
          CalendarContract.Instances.TITLE,
          CalendarContract.Instances.BEGIN,
          CalendarContract.Instances.END,
          CalendarContract.Instances.ALL_DAY,
          CalendarContract.Instances.EVENT_LOCATION,
        ),
        null,
        null,
        "${CalendarContract.Instances.BEGIN} ASC",
      )?.use { cursor ->
        while (cursor.moveToNext() && results.size < limit) {
          results.add(
            mapOf(
              "title" to (cursor.getString(0) ?: "Untitled"),
              "begin" to cursor.getLong(1).toDouble(),
              "end" to cursor.getLong(2).toDouble(),
              "allDay" to (cursor.getInt(3) == 1),
              "location" to cursor.getString(4),
            ),
          )
        }
      }
      results
    }

    // Opens the calendar's own "new event" screen, filled in. No permission
    // needed, and the owner confirms it there.
    Function("addCalendarEvent") { title: String, startMs: Double, endMs: Double ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val intent = Intent(Intent.ACTION_INSERT, CalendarContract.Events.CONTENT_URI)
        .putExtra(CalendarContract.Events.TITLE, title)
        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMs.toLong())
        .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMs.toLong())
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }

    AsyncFunction("installedApps") {
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { mapOf("label" to it.loadLabel(pm).toString(), "package" to it.activityInfo.packageName) }
        .distinctBy { it["package"] }
    }

    Function("openApp") { packageName: String ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return@Function false
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext

  private fun requireGranted(permission: String): Context {
    val context = context() ?: throw IllegalStateException("NO_CONTEXT")
    if (context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("PERMISSION_DENIED:" + permission.substringAfterLast('.'))
    }
    return context
  }

  private fun contactName(context: Context, number: String): String? {
    if (number.isBlank()) return null
    if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
    val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
    return try {
      context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (_: IllegalArgumentException) {
      null
    }
  }
}
