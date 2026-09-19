from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
from typing import Any

from .actions import ACTIONS

HOST = "127.0.0.1"
PORT = 8765
MAX_BODY = 65_536
SECRET = os.environ.get("JARVIS_IPC_SECRET")

if not SECRET:
    raise RuntimeError("JARVIS_IPC_SECRET is required")


class Handler(BaseHTTPRequestHandler):
    server_version = "JarvisBridge/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def send_json(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self) -> None:
        auth = self.headers.get("X-Jarvis-Auth", "")
        if not hmac.compare_digest(auth, SECRET):
            self.send_json(403, {"ok": False, "error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("invalid request size")

            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("request must be an object")

            action_name = payload.get("action")
            params = payload.get("params", {})
            if not isinstance(action_name, str):
                raise ValueError("action required")
            if not isinstance(params, dict):
                raise ValueError("params must be an object")

            action = ACTIONS.get(action_name)
            if action is None:
                self.send_json(404, {"ok": False, "error": "unknown action"})
                return

            result = action(params)
            self.send_json(200, {"ok": True, "result": result})
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "invalid json"})
        except ValueError as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:  # final containment boundary
            self.send_json(500, {"ok": False, "error": str(exc)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"JARVIS bridge listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
