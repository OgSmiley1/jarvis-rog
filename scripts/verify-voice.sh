#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
corepack pnpm check
corepack pnpm lint
corepack pnpm exec vitest run tests/voicePipeline.test.ts tests/voiceSession.test.ts tests/cloudBrain.test.ts tests/thinkLeak.test.ts tests/liveVoiceLifecycle.test.ts
echo "VOICE SOFTWARE CHECKS PASSED; device tests remain separate"
