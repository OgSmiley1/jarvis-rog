#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >=20.19 is required."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@10.15.0 --activate
fi

pnpm install
npx expo install --fix
pnpm check
pnpm lint
pnpm test

echo "Bootstrap complete. Next: pnpm prebuild:android"
