plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.eskatesuv.ridervoz.voicenext"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
    }

    sourceSets["main"].java.srcDir("../../voice-next")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    compileOnly("com.capacitorjs:core:8.0.2")
    compileOnly("androidx.core:core-ktx:1.15.0")
    compileOnly(files("libs/sherpa-onnx-1.13.8.aar"))
}
