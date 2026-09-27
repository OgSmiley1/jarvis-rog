from __future__ import annotations

import re
import subprocess
from typing import Any

PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$")

# Execution-side policy: the model never gets to launch an arbitrary package.
# Keep this in sync with the React Native deterministic router and only extend
# it deliberately after a physical-device acceptance test.
ALLOWED_PACKAGES = {
    "com.google.android.gm",
    "com.google.android.youtube",
    "com.whatsapp",
    "com.android.chrome",
    "com.google.android.apps.photos",
    "com.google.android.apps.maps",
}


def app_open(params: dict[str, Any]) -> dict[str, Any]:
    package = params.get("package")
    if not isinstance(package, str):
        raise ValueError("package required")

    clean = package.strip()
    if not PACKAGE_RE.fullmatch(clean):
        raise ValueError("invalid Android package")
    if clean not in ALLOWED_PACKAGES:
        raise ValueError("package not approved")

    result = subprocess.run(
        [
            "/system/bin/am",
            "start",
            "-a",
            "android.intent.action.MAIN",
            "-c",
            "android.intent.category.LAUNCHER",
            "-p",
            clean,
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "app launch failed")

    return {
        "package": clean,
        "exitCode": result.returncode,
        "stdout": result.stdout.strip(),
    }
