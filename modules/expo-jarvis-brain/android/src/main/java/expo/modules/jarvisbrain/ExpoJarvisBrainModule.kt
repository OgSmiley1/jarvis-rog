package expo.modules.jarvisbrain

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * The brain is 2.5 GB. An in-app download dies whenever Android pauses or
 * kills JARVIS in the background, and starts again from zero. DownloadManager
 * is a system service: it keeps going with the app closed, resumes after
 * network drops, and shows its own progress notification.
 *
 * The file lands in the app's external files directory
 * (Android/data/<package>/files/models), which needs no storage permission,
 * is readable by llama.cpp as a plain path, and survives app updates.
 *
 * It downloads to "<name>.part" and is renamed only once complete, so a
 * half-finished file can never be mistaken for the brain.
 */
class ExpoJarvisBrainModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoJarvisBrain")

    Function("modelDirectory") {
      val context = context() ?: return@Function null
      modelDir(context).absolutePath
    }

    Function("fileSize") { path: String ->
      val file = File(path.removePrefix("file://"))
      if (file.isFile) file.length().toDouble() else -1.0
    }

    Function("deleteFile") { path: String ->
      File(path.removePrefix("file://")).delete()
    }

    Function("activeDownload") {
      val context = context() ?: return@Function null
      val id = prefs(context).getLong(KEY_ID, -1L)
      if (id < 0) null else id.toDouble()
    }

    Function("startDownload") { url: String, fileName: String, title: String ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val manager = manager(context)
      val existing = prefs(context).getLong(KEY_ID, -1L)
      if (existing >= 0) {
        val state = query(manager, existing)["state"]
        if (state == "pending" || state == "running" || state == "paused") return@Function existing.toDouble()
      }

      val dir = modelDir(context)
      File(dir, "$fileName.part").delete()
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setDescription("JARVIS brain · runs offline once downloaded")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(context, DIR_TYPE, "$fileName.part")
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)
      val id = manager.enqueue(request)
      prefs(context).edit().putLong(KEY_ID, id).apply()
      id.toDouble()
    }

    Function("downloadStatus") { id: Double ->
      val context = context() ?: return@Function mapOf("state" to "missing")
      query(manager(context), id.toLong())
    }

    // Renames the finished ".part" file into place and forgets the download.
    // The DownloadManager entry is deliberately not removed: remove() would
    // delete the file it points at.
    Function("finishDownload") { fileName: String ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val dir = modelDir(context)
      val part = File(dir, "$fileName.part")
      val target = File(dir, fileName)
      if (part.isFile) {
        if (target.exists()) target.delete()
        if (!part.renameTo(target)) throw IllegalStateException("MODEL_RENAME_FAILED")
      }
      prefs(context).edit().remove(KEY_ID).apply()
      if (!target.isFile) throw IllegalStateException("MODEL_DOWNLOAD_VERIFICATION_FAILED")
      "file://${target.absolutePath}"
    }

    Function("cancelDownload") {
      val context = context() ?: return@Function false
      val id = prefs(context).getLong(KEY_ID, -1L)
      if (id >= 0) manager(context).remove(id)
      prefs(context).edit().remove(KEY_ID).apply()
      true
    }
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext

  private fun manager(context: Context) = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  private fun prefs(context: Context) = context.getSharedPreferences("jarvis.brain", Context.MODE_PRIVATE)

  private fun modelDir(context: Context): File {
    val dir = context.getExternalFilesDir(DIR_TYPE) ?: File(context.filesDir, DIR_TYPE)
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun query(manager: DownloadManager, id: Long): Map<String, Any?> {
    manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
      if (cursor == null || !cursor.moveToFirst()) return mapOf("state" to "missing")
      val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val state = when (status) {
        DownloadManager.STATUS_RUNNING -> "running"
        DownloadManager.STATUS_PAUSED -> "paused"
        DownloadManager.STATUS_SUCCESSFUL -> "success"
        DownloadManager.STATUS_FAILED -> "failed"
        else -> "pending"
      }
      return mapOf(
        "state" to state,
        "bytes" to cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)).toDouble(),
        "total" to cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)).toDouble(),
        "reason" to cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)),
      )
    }
  }

  companion object {
    private const val DIR_TYPE = "models"
    private const val KEY_ID = "downloadId"
  }
}
