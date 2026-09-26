from __future__ import annotations

import os
import subprocess
from typing import Any


def _safe_repo_path(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("path required")
    path = os.path.realpath(os.path.expanduser(value.strip()))
    home = os.path.realpath(os.path.expanduser("~"))
    if not (path == home or path.startswith(home + os.sep)):
        raise ValueError("repository path must be inside the Termux home directory")
    if not os.path.isdir(path):
        raise ValueError("repository path does not exist")
    return path


def git_status(params: dict[str, Any]) -> dict[str, Any]:
    path = _safe_repo_path(params.get("path"))
    result = subprocess.run(
        ["git", "-C", path, "status", "--short", "--branch"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "git status failed")

    return {
        "exitCode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }
