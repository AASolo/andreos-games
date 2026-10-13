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
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// Вечернее напоминание: если сегодня ещё не играли, приложение напомнит про серию дней.
object Reminders {
    private const val PREFS = "reminders"
    private const val CHANNEL = "streak"
    private const val HOUR = 19

    fun save(context: Context, enabled: Boolean, lastDay: String, streak: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled)
            .putString("lastDay", lastDay)
            .putInt("streak", streak)
            .apply()
        schedule(context)
    }

    fun schedule(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = pendingIntent(context)
        alarm.cancel(pending)
        if (!prefs.getBoolean("enabled", false)) return
        val next = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, HOUR)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
        alarm.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.timeInMillis, AlarmManager.INTERVAL_DAY, pending)
    }

    private fun pendingIntent(context: Context) = PendingIntent.getBroadcast(
        context, 0, Intent(context, ReminderReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    fun show(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean("enabled", false)) return
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        if (prefs.getString("lastDay", "") == today) return // сегодня уже играли
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val streak = prefs.getInt("streak", 0)
        val yesterday = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(System.currentTimeMillis() - 86_400_000L))
        val alive = streak > 0 && prefs.getString("lastDay", "") == yesterday
        val (title, text) = if (alive) {
            "🔥 Серия $streak ${days(streak)} под угрозой!" to "Сыграй сегодня в любую игру, чтобы не потерять серию"
        } else {
            "🎮 Пора поиграть!" to "Твои игры соскучились. Начни новую серию дней"
        }

        val nm = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Напоминания о серии", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val open = PendingIntent.getActivity(
            context, 1, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setColor(0xFF8B5CFF.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(1, n)
        } catch (_: SecurityException) {
        }
    }

    private fun days(n: Int): String {
        val m10 = n % 10
        val m100 = n % 100
        return when {
            m10 == 1 && m100 != 11 -> "день"
            m10 in 2..4 && (m100 < 12 || m100 > 14) -> "дня"
            else -> "дней"
        }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Reminders.schedule(context)
            Updates.schedule(context)
        } else {
            Reminders.show(context)
        }
    }
}
