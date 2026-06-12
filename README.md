# 🎯 Power Goal

**Persistent goal loop for OpenCode.**  
Same TUI-injection mechanics as [ChronoLoop](https://github.com/lirrensi/opencode-chronoloop), but with goal semantics — the agent receives a persistent objective and can self-report completion via a tool.

```
/powergoal Implement the auth module
```

The goal is injected as a user-side message (no system prompt manipulation, no cache breakage).  
The agent works toward it, and when done, calls `manage_goal` to exit the loop.

---

## How It Works

1. **Start a goal** — `/powergoal <objective>` fires an initial message into the
   current session: `# Started goal:\n<objective>`
2. **True idle detection** — after 30 seconds of genuine idle (the agent
   finished its turn, no compaction noise, no transient events), a follow-up
   is sent: `# Pursuing goal:\n<objective>`
3. **Agent completes** — the agent calls the `manage_goal` tool:
   ```
   manage_goal({ set_status: "complete" })
   ```
4. **Loop exits** — the goal is cleared, the agent is free.

The plugin also exposes `manage_goal({ set_status: "blocked" })` for the agent
to signal a blocker, and `manage_goal({ set_status: "active", goal_text })` to
set a new goal programmatically.

---

## Installation

```bash
git clone https://github.com/lirrensi/opencode-powergoal.git
cd opencode-powergoal
pnpm install
pnpm run deploy
```

This strips test-only exports and installs a single-file plugin to
`~/.config/opencode/plugins/opencode-powergoal.ts`. OpenCode loads it
automatically from there — restart to pick up changes.

---

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/powergoal <objective>` | Start a new goal with the given objective |
| `/powergoal stop` | Stop the active goal |
| `/powergoal complete` | Mark the active goal as complete |
| `/powergoal status` | Show current goal status and elapsed time |

### Tool: `manage_goal`

The plugin exposes a single tool for the agent to manage the goal loop:

```typescript
manage_goal({
  set_status: "active" | "complete" | "blocked",
  goal_text?: string // Required when set_status is "active"
})
```

**Agent workflow:**
1. Agent starts by calling `manage_goal({ set_status: "active", goal_text: "..." })`
2. Plugin sends the initial goal message, enters dwell-based loop
3. On each follow-up, the agent is reminded: `(use 'manage_goal' for completion)`
4. Agent completes the goal: `manage_goal({ set_status: "complete" })`
5. Plugin clears the goal, loop exits

---

## How It Differs from ChronoLoop

| Aspect | ChronoLoop | Power Goal |
|--------|------------|------------|
| **Purpose** | Endless autonomous loop | Goal-oriented persistent loop |
| **Exit** | Time-based (duration expires) | Agent-driven (`manage_goal` tool) |
| **Start** | `/chronoloop <minutes>` | `/powergoal <objective>` |
| **Initial fire** | Waits for first idle | Fires immediately |
| **Tool exposure** | None (hidden from agent) | `manage_goal` for completion |
| **Completion hint** | Not applicable | Injected after 2nd follow-up |

---

## Development

```bash
# Type-check
pnpm typecheck

# Run tests
pnpm test

# Watch tests
pnpm test:watch

# Deploy locally
pnpm deploy
```

### Project structure

```
opencode-powergoal/
├── src/
│   ├── index.ts          # Plugin entrypoint (single-file deploy target)
│   └── test-helpers.ts   # Test-only utilities (stripped by deploy script)
├── test/
│   └── index.test.ts     # Test suite (~500 lines, full coverage)
├── scripts/
│   ├── deploy.mjs        # Single-file plugin deploy script
│   └── sync-plugins.mjs  # Plugin sync helper
├── CHANGELOG.md
├── LICENSE
└── package.json
```

---

## License

MIT
