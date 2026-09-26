from .system import system_status
from .git import git_status
from .apps import app_open

ACTIONS = {
    "system.status": system_status,
    "git.status": git_status,
    "app.open": app_open,
}
