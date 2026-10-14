package com.andreos.games

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import androidx.core.content.pm.PackageInfoCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var menuReady = false

    // Игры лежат в assets и открываются по https-адресу этого хоста,
    // поэтому у них работают localStorage, service worker и относительные ссылки.
    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        Updates.schedule(applicationContext)

        // Заставка держится, пока не загрузится меню (но не дольше 3 секунд),
        // а потом иконка улетает вперёд и растворяется.
        val started = SystemClock.uptimeMillis()
        splash.setKeepOnScreenCondition { !menuReady && SystemClock.uptimeMillis() - started < 3000 }
        splash.setOnExitAnimationListener { provider ->
            provider.iconView.animate()
                .scaleX(1.6f).scaleY(1.6f).alpha(0f)
                .setDuration(380)
                .start()
            provider.view.animate()
                .alpha(0f)
                .setStartDelay(120)
                .setDuration(380)
                .withEndAction { provider.remove() }
                .start()
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        hideSystemBars()

        webView = WebView(this).apply {
            setBackgroundColor(0xFF0B0914.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = GamesWebViewClient()
            webChromeClient = WebChromeClient()
            addJavascriptInterface(AppBridge(), "AndroidApp")
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
                object : ServiceWorkerClientCompat() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? =
                        assetLoader.shouldInterceptRequest(request.url)
                }
            )
        }
        setContentView(FrameLayout(this).apply { addView(webView) })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(startUrl(intent))
        }
        Thread { publishShortcuts() }.start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getStringExtra(EXTRA_GAME) != null || intent.getIntExtra(EXTRA_UPDATE, 0) > 0) webView.loadUrl(startUrl(intent))
    }

    // Ярлык с иконки приложения открывает меню с ?play=<игра>,
    // меню засчитывает запуск в статистику и сразу открывает игру.
    private fun startUrl(intent: Intent?): String {
        val update = intent?.getIntExtra(EXTRA_UPDATE, 0) ?: 0
        if (update > 0) return "$MENU_URL?update=$update"
        val game = intent?.getStringExtra(EXTRA_GAME) ?: return MENU_URL
        return "$MENU_URL?play=" + Uri.encode(game)
    }

    private fun publishShortcuts() {
        val shortcuts = GAMES.mapIndexedNotNull { rank, (id, title, iconPath) ->
            val icon = try {
                assets.open("games/$id/$iconPath").use { BitmapFactory.decodeStream(it) }?.let { circle(it) }
            } catch (_: Exception) {
                null
            }
            ShortcutInfoCompat.Builder(this, id)
                .setShortLabel(title)
                .setRank(rank)
                .setIcon(icon?.let { IconCompat.createWithBitmap(it) }
                    ?: IconCompat.createWithResource(this, R.mipmap.ic_launcher))
                .setIntent(
                    Intent(this, MainActivity::class.java)
                        .setAction(Intent.ACTION_VIEW)
                        .putExtra(EXTRA_GAME, id)
                )
                .build()
        }
        try {
            ShortcutManagerCompat.setDynamicShortcuts(this, shortcuts.take(ShortcutManagerCompat.getMaxShortcutCountPerActivity(this)))
        } catch (_: Exception) {
        }
    }

    private fun circle(src: Bitmap): Bitmap {
        val size = 192
        val side = minOf(src.width, src.height)
        val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
        val scaled = Bitmap.createScaledBitmap(square, size, size, true)
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
        Canvas(out).drawCircle(size / 2f, size / 2f, size / 2f, paint)
        return out
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    // Мост для меню: вибрация, «поделиться», внешние ссылки и номер версии.
    private inner class AppBridge {
        @JavascriptInterface
        fun vibrate(pattern: String) {
            val times = pattern.split(",").mapNotNull { it.trim().toLongOrNull() }.filter { it in 0..1000 }
            if (times.isEmpty()) return
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            if (!vibrator.hasVibrator()) return
            val effect = if (times.size == 1) {
                VibrationEffect.createOneShot(times[0], VibrationEffect.DEFAULT_AMPLITUDE)
            } else {
                VibrationEffect.createWaveform((listOf(0L) + times).toLongArray(), -1)
            }
            vibrator.vibrate(effect)
        }

        @JavascriptInterface
        fun share(text: String) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            runOnUiThread { startActivity(Intent.createChooser(send, "Поделиться Andreos Play")) }
        }

        @JavascriptInterface
        fun openUrl(url: String) {
            val uri = Uri.parse(url)
            if (uri.scheme != "https" && uri.scheme != "http") return
            runOnUiThread {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                } catch (_: ActivityNotFoundException) {
                }
            }
        }

        @JavascriptInterface
        fun setReminder(enabled: Boolean, lastDay: String, streak: Int) {
            Reminders.save(applicationContext, enabled, lastDay, streak)
        }

        @JavascriptInterface
        fun requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                runOnUiThread { requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 7) }
            }
        }

        @JavascriptInterface
        fun downloadUpdate(build: Int) = Updater.download(applicationContext, build)

        @JavascriptInterface
        fun updateStatus(): String = Updater.status(applicationContext)

        @JavascriptInterface
        fun installUpdate(): Boolean = Updater.install(this@MainActivity)

        @JavascriptInterface
        fun cleanupUpdates(): String = Updater.cleanup(applicationContext)

        // Huawei, Honor, Xiaomi и др. усыпляют фоновые задачи: без разрешения
        // на автозапуск уведомления об обновлениях могут не приходить
        @JavascriptInterface
        fun needsBackgroundSetup(): Boolean =
            Build.MANUFACTURER.lowercase() in setOf("huawei", "honor", "xiaomi", "redmi", "poco", "oppo", "realme", "vivo", "meizu")

        @JavascriptInterface
        fun openBackgroundSettings() {
            val candidates = listOf(
                "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
                "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
                "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
                "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            ).map { (pkg, cls) -> Intent().setComponent(android.content.ComponentName(pkg, cls)) } +
                Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            runOnUiThread {
                for (i in candidates) {
                    try {
                        startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return@runOnUiThread
                    } catch (_: Exception) {
                    }
                }
            }
        }

        @JavascriptInterface
        fun versionCode(): Int = PackageInfoCompat.getLongVersionCode(packageInfo()).toInt()

        @JavascriptInterface
        fun versionName(): String = packageInfo().versionName ?: ""

        private fun packageInfo() = packageManager.getPackageInfo(packageName, 0)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    // Фоновая музыка меню замолкает, когда приложение свёрнуто
    override fun onPause() {
        webView.evaluateJavascript("typeof ambient !== 'undefined' && ambient.stop(true)", null)
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        Updater.resumeInstall(this)
        webView.evaluateJavascript("typeof ambient !== 'undefined' && !busy && ambient.start()", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Сначала спрашиваем меню: может, нужно просто закрыть ленту уведомлений
        webView.evaluateJavascript("window.andreosBack ? andreosBack() : false") { result ->
            if (result != "true") goBack()
        }
    }

    private fun goBack() {
        when {
            webView.canGoBack() -> webView.goBack()
            webView.url?.startsWith(MENU_URL) == false -> webView.loadUrl(MENU_URL)
            else -> @Suppress("DEPRECATION") super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private inner class GamesWebViewClient : WebViewClientCompat() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            assetLoader.shouldInterceptRequest(request.url)

        override fun onPageFinished(view: WebView, url: String) {
            menuReady = true
            // Из меню «Назад» всегда выходит из приложения, а не листает старые игры.
            if (url.startsWith(MENU_URL)) view.clearHistory()
        }

        // Ссылки на сайты, инстаграм и т.п. открываем в обычном браузере.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
            if (!request.isForMainFrame) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            } catch (_: ActivityNotFoundException) {
            }
            return true
        }
    }

    companion object {
        const val EXTRA_GAME = "game"
        const val EXTRA_UPDATE = "update"

        // id репозитория, название для ярлыка, картинка для иконки ярлыка
        val GAMES = listOf(
            Triple("doroga-v-okean", "Дорога в океан", "og.jpg"),
            Triple("ButerBashnya-1.0", "Бутербашня", "icon-512.png"),
            Triple("kimchi-gleba", "Кимчи-кафе", "icon-512.png"),
            Triple("HackQuest-3.0", "HackQuest", "icon-512.png"),
            Triple("BlockFlip", "Блок Флип", "icon-512.png"),
        )
        const val MENU_URL = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html"
    }
}
