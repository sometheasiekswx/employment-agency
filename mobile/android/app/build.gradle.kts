import java.net.URI

plugins {
  alias(libs.plugins.android.application)
}

val workspaceOrigin = providers.gradleProperty("eaWorkspaceOrigin")
  .orElse(providers.environmentVariable("EA_WORKSPACE_ORIGIN"))
  .getOrElse("")

if (workspaceOrigin.isNotEmpty()) {
  val uri = URI(workspaceOrigin)
  require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null
    && uri.path in listOf("", "/") && (uri.port == -1 || uri.port in 1..65535)
    && (uri.scheme == "https" || (uri.scheme == "http" && uri.host == "127.0.0.1"))) {
    "EA_WORKSPACE_ORIGIN must be a workspace HTTPS origin (debug builds also support loopback fixtures)."
  }
}

android {
  namespace = "app.employmentagency.mobile"
  compileSdk = 37

  defaultConfig {
    applicationId = "app.employmentagency.mobile"
    minSdk = 26
    targetSdk = 37
    versionCode = 1
    versionName = "0.1"
    buildConfigField("String", "WORKSPACE_ORIGIN", "\"$workspaceOrigin\"")
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  buildFeatures {
    buildConfig = true
  }
}

dependencies {
  implementation(libs.androidx.activity)
  implementation(libs.androidx.browser)
}
