#!/usr/bin/env bash
set -euo pipefail
pnpm check
pnpm lint
pnpm test -- tests/voicePipeline.test.ts
echo "VOICE PIPELINE GREEN"
