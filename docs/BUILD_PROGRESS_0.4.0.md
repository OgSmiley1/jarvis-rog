# JARVIS ROG Build 0.4.0 — Android CI / ASUS Integration

## Objective
Build a real Android APK in GitHub Actions, then install and validate it on the physical ASUS ROG Phone 8 Pro.

## Repository state
The complete Build 0.3 source tree is now committed to this repository. Android CI and an ADB install helper are present.

## Already verified on the physical device
- ASUS AI2401_D / AI2401
- Android 16 / API 36
- arm64-v8a
- ADB authorization from the user's Intel macOS Catalina machine

## Current build gate
GitHub Actions must pass dependency install, Expo dependency check, TypeScript, lint, Vitest, smoke test, clean Android prebuild, and Gradle assembleDebug. Only a produced APK counts as a pass.

## Always-available voice boundary
The long-term design can support an always-available local wake-word assistant, but not covert continuous recording. Wake detection should run locally, ambient audio should not be stored by default, microphone use must remain visible, and inference should start only after an intentional wake/action condition.
