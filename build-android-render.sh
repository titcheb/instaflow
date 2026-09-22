#!/usr/bin/env bash
set -euo pipefail

ROOT="$PWD/.android-build"
SDK="$ROOT/sdk"
GRADLE_HOME_DIR="$ROOT/gradle"
mkdir -p "$ROOT" "$SDK" "$GRADLE_HOME_DIR" dist

# Restore the Android source tree from verified base64 chunks.
rm -rf android
cat android-src.part01 android-src.part02 android-src.part03 android-src.part04 android-src.part05 android-src.part06 android-src.part07 > "$ROOT/android-src.b64"
base64 -d "$ROOT/android-src.b64" > "$ROOT/nexa-android.tar.gz"
gzip -t "$ROOT/nexa-android.tar.gz"
tar -xzf "$ROOT/nexa-android.tar.gz"
test -f android/app/src/main/java/se/nexa/iptv/MainActivity.java

# Render's Node image may not include Java. Install a local Temurin JDK 17 when needed.
if ! command -v java >/dev/null 2>&1; then
  echo "Installing JDK 17..."
  curl -fL --retry 3 --retry-delay 2 \
    'https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse' \
    -o "$ROOT/jdk.tar.gz"
  mkdir -p "$ROOT/jdk"
  tar -xzf "$ROOT/jdk.tar.gz" -C "$ROOT/jdk"
  export JAVA_HOME="$(find "$ROOT/jdk" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

java -version

# Android command-line tools.
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Installing Android command-line tools..."
  curl -fL --retry 3 --retry-delay 2 \
    'https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip' \
    -o "$ROOT/android-cli.zip"
  rm -rf "$ROOT/android-cli" "$SDK/cmdline-tools"
  mkdir -p "$ROOT/android-cli" "$SDK/cmdline-tools"
  unzip -q "$ROOT/android-cli.zip" -d "$ROOT/android-cli"
  mv "$ROOT/android-cli/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

yes | sdkmanager --licenses >/dev/null || true
sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'

# Gradle 8.9 is compatible with Android Gradle Plugin 8.7.x used by the project.
if [ ! -x "$GRADLE_HOME_DIR/gradle-8.9/bin/gradle" ]; then
  echo "Installing Gradle 8.9..."
  curl -fL --retry 3 --retry-delay 2 \
    'https://services.gradle.org/distributions/gradle-8.9-bin.zip' \
    -o "$ROOT/gradle.zip"
  unzip -q "$ROOT/gradle.zip" -d "$GRADLE_HOME_DIR"
fi

"$GRADLE_HOME_DIR/gradle-8.9/bin/gradle" -p android assembleDebug --no-daemon --stacktrace

cp android/app/build/outputs/apk/debug/app-debug.apk dist/NEXA-IPTV.apk
rm -f dist/NEXA-IPTV-Android-Source.zip
zip -qr dist/NEXA-IPTV-Android-Source.zip android

ls -lh dist/NEXA-IPTV.apk dist/NEXA-IPTV-Android-Source.zip
