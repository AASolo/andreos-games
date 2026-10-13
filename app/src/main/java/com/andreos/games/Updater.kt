package com.andreos.games

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import org.json.JSONObject
import java.io.File

// Обновление прямо из приложения: скачиваем APK в папку приложения, ставим поверх,
// а после установки удаляем установочный файл, чтобы он не копился в памяти телефона.
object Updater {
    private const val PREFS = "updater"

    private fun dir(context: Context): File? = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
    private fun dm(context: Context) = context.getSystemService(DownloadManager::class.java)
    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun currentBuild(context: Context) =
        PackageInfoCompat.getLongVersionCode(context.packageManager.getPackageInfo(context.packageName, 0)).toInt()

    fun download(context: Context, build: Int) {
        if (build <= currentBuild(context)) return
        val p = prefs(context)
        val old = p.getLong("id", -1)
        if (old >= 0) dm(context).remove(old)
        dir(context)?.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { it.delete() }
        val req = DownloadManager.Request(Uri.parse(Updates.APK_URL))
            .setTitle("Andreos Play, сборка $build")
            .setDescription("Скачивается обновление")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "AndreosPlay-$build.apk")
        val id = dm(context).enqueue(req)
        p.edit().putLong("id", id).putInt("build", build).apply()
    }

    // {"state":"running|done|failed|none","pct":0..100}
    fun status(context: Context): String {
        val id = prefs(context).getLong("id", -1)
        val o = JSONObject().put("state", "none").put("pct", 0)
        if (id < 0) return o.toString()
        dm(context).query(DownloadManager.Query().setFilterById(id)).use { c ->
            if (!c.moveToFirst()) return o.toString()
            val st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            o.put("pct", if (total > 0) (got * 100 / total).toInt() else 0)
            o.put("state", when (st) {
                DownloadManager.STATUS_SUCCESSFUL -> "done"
                DownloadManager.STATUS_FAILED -> "failed"
                else -> "running"
            })
        }
        return o.toString()
    }

    private fun apk(context: Context): File? {
        val build = prefs(context).getInt("build", 0)
        return dir(context)?.let { File(it, "AndreosPlay-$build.apk") }?.takeIf { it.exists() }
    }

    // true, если открыли установщик; false, если сначала нужно разрешение «Установка из этого источника»
    fun install(activity: Activity): Boolean {
        val file = apk(activity) ?: return false
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            prefs(activity).edit().putBoolean("waitPermission", true).apply()
            activity.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.packageName))
            )
            return false
        }
        prefs(activity).edit().putBoolean("waitPermission", false).apply()
        val uri = FileProvider.getUriForFile(activity, activity.packageName + ".updates", file)
        activity.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        return true
    }

    // Вернулись из настроек с выданным разрешением: продолжаем установку
    fun resumeInstall(activity: Activity) {
        if (!prefs(activity).getBoolean("waitPermission", false)) return
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) return
        install(activity)
    }

    // После установки новой версии удаляем установочные файлы.
    // Возвращает {"build":N,"mb":X.X}, если что-то удалили, иначе пустую строку.
    fun cleanup(context: Context): String {
        val p = prefs(context)
        val build = p.getInt("build", 0)
        if (build == 0 || currentBuild(context) < build) return ""
        var bytes = 0L
        dir(context)?.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { bytes += it.length(); it.delete() }
        val id = p.getLong("id", -1)
        if (id >= 0) dm(context).remove(id)
        p.edit().clear().apply()
        return JSONObject().put("build", build).put("mb", Math.round(bytes / 104857.6) / 10.0).toString()
    }
}
