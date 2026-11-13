# GarminLink (Capacitor plugin)

Android Bluetooth path for a live Simple Lift workout. The watch app id is `b724187045624031be108c6b6e5c76b6`. The plugin talks to it through the [Connect IQ Mobile SDK](https://developer.garmin.com/connect-iq/core-topics/mobile-sdk-for-android/) (`ConnectIQ`, `IQApp`, `sendMessage`, `registerForAppEvents`). Garmin Connect on the phone owns the Bluetooth link to the watch. This repo does not contain the APK project or a signing key. Add the module to that wrapper.

The web app calls `Capacitor.Plugins.GarminLink` when it is there and otherwise uses the server. Pairing is a `hello` from the phone and the watch's 6-digit code sent back over this link, which the phone claims. The code screen stays for when Bluetooth is not available.

## Gradle

In the wrapper's `settings.gradle`:

```gradle
include ':garmin-link'
project(':garmin-link').projectDir = new File('../simplelift/capacitor/garmin-link/android')
include ':capacitor-android'
```

In the app module `build.gradle`:

```gradle
dependencies {
    implementation project(':garmin-link')
}
```

The plugin module already depends on:

```gradle
implementation "com.garmin.connectiq:ciq-companion-app-sdk:2.2.0@aar"
implementation project(':capacitor-android')
```

`capacitor-android` is the Capacitor Android project the wrapper already has. Do not commit a Garmin developer key or a keystore.

## Permissions

`android/src/main/AndroidManifest.xml` in this module merges into the APK:

- `BLUETOOTH` and `BLUETOOTH_ADMIN` (max SDK 30)
- `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`
- `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (scan on older Android)
- `<queries>` for `com.garmin.android.apps.connectmobile`

Garmin Connect must be installed and the watch paired there. On Android 12 and newer the system will ask for the nearby-devices permission the first time the link starts.

## JS

```js
const link = Capacitor.Plugins.GarminLink;
await link.start();
await link.addListener('message', (ev) => { /* ev.json is a snapshot, hello, or pair */ });
await link.addListener('status', (ev) => { /* ev.connected */ });
await link.send({ json: JSON.stringify(snapshot) });
```

`start` initializes `ConnectIQ` with `IQConnectType.WIRELESS`. `send` calls `sendMessage` on app id `b7241870-4562-4031-be10-8c6b6e5c76b6`. Incoming watch messages arrive from `registerForAppEvents`.
