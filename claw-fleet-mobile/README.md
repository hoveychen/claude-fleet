# Claw Fleet Mobile

Mobile companion app for [Claw Fleet](../README.md). Monitor your AI agents from your phone.

## Prerequisites

- Node.js 20+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- For Android: Android Studio + SDK, JDK 17
- For iOS: Xcode 15+ (macOS only)

## Setup

```bash
cd claw-fleet-mobile
npm install
```

## Development

```bash
# Start Expo dev server
npx expo start

# Run on Android emulator
npx expo start --android

# Run on iOS simulator (macOS only)
npx expo start --ios

# Run in web browser (for quick testing)
npx expo start --web
```

## Building

### Android APK (local)

```bash
# Generate native Android project
npx expo prebuild --platform android

# Build APK
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

### iOS (local, macOS only)

```bash
# Generate native iOS project
npx expo prebuild --platform ios

# Open in Xcode
open ios/ClawFleet.xcworkspace
# Build from Xcode, or:
cd ios && xcodebuild -workspace ClawFleet.xcworkspace -scheme ClawFleet -configuration Release -sdk iphoneos
```

### Using EAS Build (cloud)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build Android APK
eas build --platform android --profile preview

# Build iOS (requires Apple Developer account)
eas build --platform ios --profile preview
```

## Connecting to Desktop

1. Open Claw Fleet Desktop
2. Click the phone icon in the sidebar footer (or go to Settings → Mobile)
3. Click "Enable Mobile Access"
4. Scan the QR code with the mobile app
   - Or scan with any QR reader — it opens a landing page with download links

## Architecture

- **Framework**: React Native with Expo (SDK 54)
- **Routing**: Expo Router (file-based)
- **State**: Zustand
- **Connection**: HTTP API + SSE (Server-Sent Events)
- **QR Scanning**: expo-camera

The app connects to the Claw Fleet Desktop's embedded HTTP server via a Cloudflare Quick Tunnel. All data flows through the Desktop — the mobile app is a read-only client (except for agent stop commands).

## CI/CD

GitHub Actions workflow at `../.github/workflows/mobile.yml`:
- Triggered by `mobile-v*` tags or manual dispatch
- Builds Android APK and uploads to GitHub Releases
- Builds iOS simulator app as artifact
