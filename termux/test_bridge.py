from __future__ import annotations

import json
import os
from urllib.request import Request, urlopen

secret = os.environ["JARVIS_IPC_SECRET"]
request = Request(
    "http://127.0.0.1:8765",
    data=json.dumps({"action": "system.status", "params": {}}).encode(),
    headers={"Content-Type": "application/json", "X-Jarvis-Auth": secret},
    method="POST",
)
with urlopen(request, timeout=3) as response:
    print(response.read().decode())
