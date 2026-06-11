# Changelog

All notable changes to **opencode-powergoal** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-06-12

### Added

- **Initial release** — persistent goal loop plugin for OpenCode.
- `/powergoal <objective>` command to start a goal.
- `/powergoal stop`, `/powergoal complete`, `/powergoal status` sub-commands.
- **`manage_goal` tool** — the agent can set, complete, or block the active
  goal via `set_status: "active" | "complete" | "blocked"`.
- **Dwell-based idle detection** — follow-up messages fire only after 30
  seconds of continuous idle, preventing rapid-fire loops and false
  positives from compaction or transient idle events.
- **Session isolation** — starting a new session auto-stops the active goal
  to prevent follow-ups from leaking across conversations.
- **Backtick eval** — `` `cmd` `` expressions in the goal message are
  evaluated and replaced inline with shell command output (like PHP
  backticks).
- **Heartbeat toast** — periodic status toast showing elapsed time and
  dwell state.
- **Deploy script** — `pnpm run deploy` strips test-only exports and
  installs a single-file plugin to `~/.config/opencode/plugins/`.

[0.1.0]: https://github.com/lirrensi/opencode-powergoal/releases/tag/v0.1.0
