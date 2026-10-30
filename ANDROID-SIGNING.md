# Android signing for Provoda Staff

The Android application ID is `com.provoda.staff`. Keep this ID unchanged for updates.

## Required GitHub Actions secrets

Add these repository secrets under **Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64` — Base64 of the supplied `provoda-release.jks` file.
- `ANDROID_KEYSTORE_PASSWORD` — the keystore password supplied with the key.
- `ANDROID_KEY_ALIAS` — `provoda-release`.
- `ANDROID_KEY_PASSWORD` — the key password supplied with the key.

On Windows PowerShell, with the keystore downloaded to the current folder, copy the Base64 value with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\provoda-release.jks")) | Set-Clipboard
```

Paste that value into the `ANDROID_KEYSTORE_BASE64` secret. Do not commit the keystore, Base64 value, or passwords to the repository.

The workflow now builds a signed **release APK**, verifies its signature, and only then publishes it. It deliberately stops if any signing secret is missing; it must never silently publish a newly debug-signed APK.

## Important migration note

Earlier APKs were built as debug builds on temporary GitHub-hosted runners. Those builds do not use the permanent release key supplied for future releases. If Android reports a signing conflict when moving from one of those older APKs, export any device-only data first, uninstall the old app once, and install the first permanently signed release. Cloud-synced account data remains in Supabase. From the first permanently signed release onward, keep this same keystore for every update; losing it prevents in-place updates.

## Play Protect

A stable signature and a release build improve update integrity, but cannot force Google Play Protect to mark a sideloaded APK as trusted. Google controls that verdict. The supported way to obtain the normal Play distribution trust path is to publish the app through Google Play Console and use Play App Signing.
