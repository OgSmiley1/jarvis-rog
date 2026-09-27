#!/usr/bin/env bash
set -euo pipefail

# Exact source commit currently under EAS validation.
# This wrapper intentionally does not use branch HEAD because follow-up
# [eas skip] documentation/QA commits may exist after the build started.
VALIDATION_COMMIT="e6e024633e60112712b1bdb8163aa049ae774416"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/install-eas-rog.sh" "$VALIDATION_COMMIT"
