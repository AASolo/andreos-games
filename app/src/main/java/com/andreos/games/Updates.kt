package com.andreos.games

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.pm.PackageInfoCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

// Проверка обновлений в фоне: раз в несколько часов смотрим последний релиз на GitHub
// и, если вышла новая сборка, присылаем уведомление на телефон (одно на каждую сборку).
object Updates {
    private const val PREFS = "updates"
    private const val CHANNEL = "updates"
    private const val API = "https://api.github.com/repos/AASolo/andreos-games/releases/latest"
    const val APK_URL = "https://github.com/AASolo/andreos-games/releases/latest/download/AndreosPlay.apk"

    // Раньше проверка шла через будильник AlarmManager без пробуждения, и на Huawei/Honor/Xiaomi
    // система его просто глушила. Теперь — WorkManager: раз в 4 часа, только когда есть интернет,
    // переживает перезагрузку и экономию батареи.
    fun schedule(context: Context) {
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarm.cancel(
            PendingIntent.getBroadcast(
                context, 10, Intent(context, UpdateReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        )
        val request = PeriodicWorkRequestBuilder<UpdateWorker>(4, TimeUnit.HOURS, 1, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(30, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("update-check", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    // Номер последней сборки на GitHub или 0, если узнать не получилось
    fun latestBuild(): Int = try {
        val c = URL(API).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000
        c.readTimeout = 10_000
        c.setRequestProperty("Accept", "application/vnd.github+json")
        val body = c.inputStream.bufferedReader().use { it.readText() }
        c.disconnect()
        Regex("\"name\"\\s*:\\s*\"[^\"]*сборка\\s+(\\d+)", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)?.toInt() ?: 0
    } catch (_: Exception) {
        0
    }

    fun check(context: Context) {
        val latest = latestBuild()
        val current = PackageInfoCompat.getLongVersionCode(
            context.packageManager.getPackageInfo(context.packageName, 0)
        ).toInt()
        if (latest <= current) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getInt("notified", 0) >= latest) return
        if (notify(context, latest)) prefs.edit().putInt("notified", latest).apply()
    }

    private fun notify(context: Context, build: Int): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        val nm = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Обновления приложения", NotificationManager.IMPORTANCE_HIGH))
        }
        // Нажатие открывает приложение и сразу запускает обновление внутри него
        val update = PendingIntent.getActivity(
            context, 11,
            Intent(context, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_UPDATE, build)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setColor(0xFF8B5CFF.toInt())
            .setContentTitle("🚀 Вышло обновление Andreos Play")
            .setContentText("Сборка $build уже готова. Нажми, чтобы обновить")
            .setContentIntent(update)
            .addAction(0, "Обновить", update)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        return try {
            NotificationManagerCompat.from(context).notify(2, n)
            true
        } catch (_: SecurityException) {
            false
        }
    }
}

class UpdateWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        Updates.check(applicationContext)
        return Result.success()
    }
}

// Оставлен для старых будильников, поставленных прошлыми версиями
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val result = goAsync()
        Thread {
            try {
                Updates.check(context.applicationContext)
            } finally {
                result.finish()
            }
        }.start()
    }
}
