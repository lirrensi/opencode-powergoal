# Changelog

All notable changes to **opencode-powergoal** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/0.1.1/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v0.2.0.html).

---

## [0.1.1] — 2026-06-24

### Fixed

- **No more `__PGOAL_HANDLED__` error spam in chat.** The `command.execute.before`
  hook previously used `throw new Error("__PGOAL_HANDLED__")` as a control-flow
  trick to abort the `/powergoal` command. This was never a documented opencode
  plugin pattern — it only worked because older opencode silently swallowed
  plugin errors. The June 9, 2026 opencode refactor (commits `07e5ea93` and
  `600e405b`) restored error logging, so every throw now surfaces as a visible
  `session.error` event with a full stack trace in the chat.
- **Hook now uses the SDK's documented mutator contract.** Clears
  `output.parts` in place and returns normally instead of throwing. No error
  propagation, no chat spam.
- **Flattened nested `if`/`throw` chains** into clean `if`/`else if`/`else`
  blocks across `status`/`stop`/`complete`/`start` subcommands. The dwell
  timer setup is now only triggered on the actual start path, not on the
  "already pursuing" early-out.

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
