plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.andreos.games"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.andreos.play"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    // Один постоянный ключ: новые версии ставятся поверх старых,
    // и прогресс в играх не теряется.
    signingConfigs {
        create("andreos") {
            storeFile = file("andreos-games.jks")
            storePassword = "andreos-games"
            keyAlias = "andreos"
            keyPassword = "andreos-games"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("andreos")
        }
        debug {
            signingConfig = signingConfigs.getByName("andreos")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
