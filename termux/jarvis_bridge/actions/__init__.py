from .system import system_status
from .git import git_status

ACTIONS = {
    "system.status": system_status,
    "git.status": git_status,
}
