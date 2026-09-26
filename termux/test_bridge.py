from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def load_local_secret() -> str:
    existing = os.environ.get("JARVIS_IPC_SECRET", "").strip()
    if existing:
        return existing

    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        raise RuntimeError("JARVIS_IPC_SECRET missing. Run ./install.sh first.")

    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("JARVIS_IPC_SECRET="):
            secret = line.split("=", 1)[1].strip()
            if secret:
                return secret

    raise RuntimeError("JARVIS_IPC_SECRET missing from .env")


secret = load_local_secret()
request = Request(
    "http://127.0.0.1:8765",
    data=json.dumps({"action": "system.status", "params": {}}).encode(),
    headers={"Content-Type": "application/json", "X-Jarvis-Auth": secret},
    method="POST",
)
with urlopen(request, timeout=3) as response:
    print(response.read().decode())
