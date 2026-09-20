from __future__ import annotations

import re
import subprocess
from typing import Any

PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$")


def app_open(params: dict[str, Any]) -> dict[str, Any]:
    package = params.get("package")
    if not isinstance(package, str) or not PACKAGE_RE.fullmatch(package.strip()):
        raise ValueError("valid Android package required")

    clean = package.strip()
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
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "app launch failed")

    return {
        "package": clean,
        "exitCode": result.returncode,
        "stdout": result.stdout.strip(),
    }
