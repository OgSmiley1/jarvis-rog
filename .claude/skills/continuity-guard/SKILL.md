---
name: continuity-guard
description: Mandatory first step when continuing a project or transferring work between ChatGPT, Codex and Claude Code. Verify current repository reality before doing anything.
---
# Continuity Guard
1. Identify the exact repo, intended outcome, branch, latest commit, working-tree changes, current deployed/build artifact and owner restrictions. Read project-specific primary status documentation completely before making changes.
2. Compare previous agent claims with Git history, actual files, latest CI and deployment or APK evidence. Treat old summaries as leads, not current truth. If conflict exists, current verified repository/build state wins; flag conflicts.
3. Produce a compact checkpoint: last verified accomplishment; unfinished tasks; active blocker and actual evidence; next smallest executable action. Do not repeat completed work unless a newer failure proves it broken.
4. Keep one canonical implementation. Never create another app/site/version to bypass a defect. Avoid rewriting existing state or changing unrelated projects.
5. For handoff, update the project's existing canonical state file with commit, files changed, tests actually run, pass/fail, external prerequisites and next action; make sure the checkpoint is portable between Claude and Codex.
6. Ask questions only when a missing answer changes architecture or an irreversible/security-sensitive step requires authorization. Otherwise inspect and execute the next verified step.
7. Communicate briefly, preferably simple Sudanese Arabic to the owner. Never say complete because code was written or a test was merely proposed. Preserve token and tool budgets by reporting deltas, not repeating history.
