package expo.modules.jarvisbrain

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Where JARVIS keeps its models (the brain, the eyes, the voice), and the
 * system downloads that fetch them.
 *
 * Everything lives in ONE permanent folder the owner can see in the Files
 * app: Download/JARVIS/models. It survives closing the app, updating it, and
 * uninstalling and reinstalling it, so nothing is ever downloaded twice.
 * Reading a folder outside the app's own needs "All files access"
 * (MANAGE_EXTERNAL_STORAGE); the setup script grants it, and the app asks
 * once if it is missing. Until it is granted the app's own folder
 * (Android/data/<package>/files/models) is used, and its files are moved
 * into the permanent folder as soon as access arrives.
 *
 * Downloads go through DownloadManager, a system service: it keeps going with
 * the app closed, resumes after network drops, and shows its own progress
 * notification. Files download to "<name>.part" and are renamed only once
 * complete, so a half-finished file can never be mistaken for a model.
 */
class ExpoJarvisBrainModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoJarvisBrain")

    Function("modelDirectory") {
      val context = context() ?: return@Function null
      modelDir(context).absolutePath
    }

    Function("permanentDirectory") { permanentDir().absolutePath }

    Function("legacyDirectory") {
      val context = context() ?: return@Function null
      legacyDir(context).absolutePath
    }

    Function("storageAccess") { hasStorageAccess() }

    // Opens Android's "All files access" page for JARVIS.
    Function("openStorageAccessSettings") {
      val context = context() ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function false
      val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (_: Exception) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    }

    // Small text files in Download/JARVIS itself (the memory backup). Null
    // or false without "All files access", so nothing is ever half-written.
    Function("readJarvisFile") { name: String ->
      if (!hasStorageAccess()) return@Function null
      val file = File(permanentDir().parentFile, name)
      if (file.isFile) file.readText() else null
    }

    AsyncFunction("writeJarvisFile") { name: String, text: String ->
      if (!hasStorageAccess()) return@AsyncFunction false
      val dir = permanentDir().parentFile ?: return@AsyncFunction false
      dir.mkdirs()
      val tmp = File(dir, "$name.part")
      tmp.writeText(text)
      val target = File(dir, name)
      if (target.exists()) target.delete()
      tmp.renameTo(target)
    }

    Function("fileSize") { path: String ->
      val file = File(path.removePrefix("file://"))
      if (file.isFile) file.length().toDouble() else -1.0
    }

    Function("deleteFile") { path: String ->
      File(path.removePrefix("file://")).delete()
    }

    // Moves every finished model file from the app's own folder into the
    // permanent one. Rename when the filesystem allows it, copy otherwise.
    // Runs off the JS thread: a copy of a 5 GB brain takes a while.
    AsyncFunction("moveToPermanent") {
      val context = context() ?: return@AsyncFunction 0
      if (!hasStorageAccess()) return@AsyncFunction 0
      val from = legacyDir(context)
      val to = permanentDir().apply { mkdirs() }
      var moved = 0
      from.walkTopDown().filter { it.isFile && !it.name.endsWith(".part") }.forEach { file ->
        val target = File(to, file.relativeTo(from).path)
        if (target.isFile && target.length() == file.length()) {
          file.delete()
          return@forEach
        }
        target.parentFile?.mkdirs()
        if (moveFile(file, target)) moved += 1
      }
      moved
    }

    // Copies a file that an older build kept somewhere else (for example the
    // voice library's private cache) into the model folder, once.
    AsyncFunction("adoptFile") { source: String, fileName: String ->
      val context = context() ?: return@AsyncFunction false
      val src = File(source.removePrefix("file://"))
      val target = File(modelDir(context), fileName)
      if (target.isFile && target.length() > 0) return@AsyncFunction true
      if (!src.isFile || src.length() == 0L) return@AsyncFunction false
      target.parentFile?.mkdirs()
      val tmp = File(target.path + ".part")
      src.copyTo(tmp, overwrite = true)
      tmp.renameTo(target)
    }

    // Each file has its own download slot, keyed by its name, so the brain,
    // the eyes and the voice files download side by side and each resumes
    // independently.
    Function("activeDownload") { fileName: String ->
      val context = context() ?: return@Function null
      val id = prefs(context).getLong(key(fileName), -1L)
      if (id < 0) null else id.toDouble()
    }

    // wifiOnly: for big downloads nobody asked for right now (the background
    // upgrade to the 8B brain). Android then waits for Wi-Fi ("Waiting for
    // Wi-Fi…") instead of spending the owner's mobile data.
    Function("startDownload") { url: String, fileName: String, title: String, wifiOnly: Boolean? ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val manager = manager(context)
      val existing = prefs(context).getLong(key(fileName), -1L)
      if (existing >= 0) {
        val state = query(manager, existing)["state"]
        if (state == "pending" || state == "running" || state == "paused") return@Function existing.toDouble()
      }

      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setDescription("JARVIS · saved on this phone for good")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setAllowedOverMetered(wifiOnly != true)
        .setAllowedOverRoaming(wifiOnly != true)
      if (hasStorageAccess()) {
        val part = File(permanentDir(), "$fileName.part")
        part.parentFile?.mkdirs()
        part.delete()
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$PERMANENT_SUBPATH/$fileName.part")
      } else {
        val part = File(legacyDir(context), "$fileName.part")
        part.parentFile?.mkdirs()
        part.delete()
        request.setDestinationInExternalFilesDir(context, DIR_TYPE, "$fileName.part")
      }
      val id = manager.enqueue(request)
      prefs(context).edit().putLong(key(fileName), id).apply()
      id.toDouble()
    }

    Function("downloadStatus") { id: Double ->
      val context = context() ?: return@Function mapOf("state" to "missing")
      query(manager(context), id.toLong())
    }

    // Renames the finished ".part" file into place and forgets the download.
    // The part may be in either folder (a download started before access was
    // granted lands in the app's own folder); the result ends up permanent
    // whenever access allows. The DownloadManager entry is deliberately not
    // removed: remove() would delete the file it points at.
    Function("finishDownload") { fileName: String ->
      val context = context() ?: throw IllegalStateException("NO_CONTEXT")
      val dirs = listOf(permanentDir(), legacyDir(context))
      val partDir = dirs.firstOrNull { File(it, "$fileName.part").isFile }
      if (partDir != null) {
        val target = File(partDir, fileName)
        if (target.exists()) target.delete()
        if (!File(partDir, "$fileName.part").renameTo(target)) throw IllegalStateException("MODEL_RENAME_FAILED")
      }
      prefs(context).edit().remove(key(fileName)).apply()
      var found = dirs.map { File(it, fileName) }.firstOrNull { it.isFile }
        ?: throw IllegalStateException("MODEL_DOWNLOAD_VERIFICATION_FAILED")
      if (hasStorageAccess() && found.parentFile == legacyDir(context)) {
        val target = File(permanentDir(), fileName)
        target.parentFile?.mkdirs()
        if (moveFile(found, target)) found = target
      }
      "file://${found.absolutePath}"
    }

    Function("cancelDownload") { fileName: String ->
      val context = context() ?: return@Function false
      val id = prefs(context).getLong(key(fileName), -1L)
      if (id >= 0) manager(context).remove(id)
      prefs(context).edit().remove(key(fileName)).apply()
      true
    }
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext

  private fun manager(context: Context) = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  // The brain keeps the original key, so a download started by an older
  // build is still found after this update.
  private fun key(fileName: String) = if (fileName == BRAIN_FILE) KEY_ID else "$KEY_ID:$fileName"

  private fun prefs(context: Context) = context.getSharedPreferences("jarvis.brain", Context.MODE_PRIVATE)

  private fun hasStorageAccess(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

  @Suppress("DEPRECATION")
  private fun permanentDir(): File =
    File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), PERMANENT_SUBPATH)

  private fun legacyDir(context: Context): File =
    context.getExternalFilesDir(DIR_TYPE) ?: File(context.filesDir, DIR_TYPE)

  private fun modelDir(context: Context): File {
    val dir = if (hasStorageAccess()) permanentDir() else legacyDir(context)
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun moveFile(from: File, to: File): Boolean {
    if (from.renameTo(to)) return true
    return try {
      val tmp = File(to.path + ".part")
      from.copyTo(tmp, overwrite = true)
      if (tmp.length() != from.length() || !tmp.renameTo(to)) {
        tmp.delete()
        false
      } else {
        from.delete()
        true
      }
    } catch (_: Exception) {
      false
    }
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
    private const val PERMANENT_SUBPATH = "JARVIS/models"
    private const val KEY_ID = "downloadId"
    private const val BRAIN_FILE = "Qwen3-4B-Q4_K_M.gguf"
  }
}
