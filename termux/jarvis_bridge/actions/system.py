from __future__ import annotations

import os
import shutil
import time
from typing import Any


def system_status(params: dict[str, Any]) -> dict[str, Any]:
    del params
    total, used, free = shutil.disk_usage(os.path.expanduser("~"))
    return {
        "uptimeSeconds": time.monotonic(),
        "disk": {"total": total, "used": used, "free": free},
        "cwd": os.getcwd(),
    }
