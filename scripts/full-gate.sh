#!/usr/bin/env bash
set -euo pipefail

pnpm check
pnpm lint
pnpm test
npx expo prebuild --platform android --clean
(
  cd android
  ./gradlew assembleDebug
)

echo "Software gates completed. Physical ROG acceptance is still required."
