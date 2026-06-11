// ═══════════════════════════════════════════
//  Power Goal — single-file plugin.
//  ChronoLoop DNA: TUI injection + true idle.
//  Goal semantics: manage_goal tool + /powergoal.
// ═══════════════════════════════════════════

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { execSync } from "child_process"

const z = tool.schema

// ── types ──

type GoalState = {
  objective: string
  status: "active" | "complete" | "blocked"
  startedAt: number
  followupCount: number
}

// ── constants ──

const DWELL_MS = 30_000
const FIRE_DEFER_MS = 100
const HANDLED = "__PGOAL_HANDLED__"

const NO_GOAL = "No active power goal.\nUsage: /powergoal <objective>"
const MSG_STOPPED = "Power goal stopped."
const MSG_COMPLETED = "Power goal completed."
const MSG_BLOCKED = "Power goal blocked."
const MSG_ARMED = "Power Goal armed — fires after 30s of idle"

const DEFAULT_COMMAND_DESCRIPTION = "start or manage a persistent goal loop"

const GOAL_START_PREFIX = "# Started goal:"
const GOAL_FOLLOWUP_PREFIX = "# Pursuing goal:"
const GOAL_COMPLETION_HINT = "(use 'manage_goal' for completion)"

// ── helpers ──

function parseCommand(input: string):
  { kind: "start"; objective: string } |
  { kind: "stop" } |
  { kind: "complete" } |
  { kind: "status" } {
  const text = input.trim()
  if (!text) return { kind: "status" }
  const lower = text.toLowerCase()
  if (lower === "stop") return { kind: "stop" }
  if (lower === "complete") return { kind: "complete" }
  return { kind: "start", objective: text }
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (s < 60) return `${s}s`
  if (m < 60) return `${m}m`
  if (m % 60 === 0) return `${h}h`
  return `${h}h ${m % 60}m`
}

function buildInitialMessage(objective: string): string {
  return `${GOAL_START_PREFIX}\n${objective}`
}

function buildFollowupMessage(objective: string, followupCount: number): string {
  const hint = followupCount >= 2 ? `\n\n${GOAL_COMPLETION_HINT}` : ""
  return `${GOAL_FOLLOWUP_PREFIX}\n${objective}${hint}`
}

function evalBackticks(msg: string): string {
  return msg.replace(/`([^`]+)`/g, (_m: string, cmd: string) => {
    const c = cmd.trim(); if (!c) return ""
    try {
      const o = (execSync(c, { encoding: "utf-8", timeout: 30_000, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }) as string).trim()
      return o || "(no output)"
    } catch (e: any) { return `(error: ${e.message.split("\n")[0]})` }
  })
}

// ═══════════════════════════════════════════
//  Plugin
// ═══════════════════════════════════════════

export const PowerGoalPlugin: Plugin = async ({ client }: any) => {
  let goal: GoalState | null = null
  let dwellTimer: ReturnType<typeof setTimeout> | null = null
  let dwellStartedAt = 0
  let isIdle = false
  let inFlight = false
  let hb: ReturnType<typeof setInterval> | null = null

  const toast = (m: string, v = "info", d = 5000) =>
    client.tui.showToast({ body: { message: m, variant: v, duration: d } }).catch(() => {})

  const cancelDwell = () => {
    if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; dwellStartedAt = 0 }
  }

  const startDwell = () => {
    if (!goal || goal.status !== "active") return
    cancelDwell()
    dwellStartedAt = Date.now()
    dwellTimer = setTimeout(() => {
      dwellTimer = null
      dwellStartedAt = 0
      if (!goal || goal.status !== "active") return
      fireFollowup()
    }, DWELL_MS)
  }

  const fire = async (message: string) => {
    if (inFlight) return
    inFlight = true
    try {
      const msg = evalBackticks(message)
      await client.tui.clearPrompt()
      await client.tui.appendPrompt({ body: { text: msg } })
      await client.tui.submitPrompt()
    } catch (e: any) {
      toast(`Power Goal fail: ${e.message}`, "error")
    } finally {
      inFlight = false
    }
  }

  const fireFollowup = () => {
    if (!goal || goal.status !== "active") return
    goal.followupCount++
    return fire(buildFollowupMessage(goal.objective, goal.followupCount))
  }

  const fireInitial = () => {
    if (!goal || goal.status !== "active") return
    return fire(buildInitialMessage(goal.objective))
  }

  const clear = () => {
    cancelDwell()
    goal = null
    inFlight = false
    isIdle = false
    if (hb) { clearInterval(hb); hb = null }
  }

  const refreshHb = () => {
    if (goal?.status === "active" && !hb) {
      hb = setInterval(() => {
        if (!goal || goal.status !== "active") return
        const elapsed = fmtElapsed(Date.now() - goal.startedAt)
        const dwellLeft = dwellStartedAt > 0 ? Math.round((DWELL_MS - (Date.now() - dwellStartedAt)) / 1000) : 0
        const status = dwellStartedAt > 0
          ? `⏳ dwell ${dwellLeft}s → fire`
          : isIdle ? "🟢 idle — waiting" : "🔴 active — processing"
        toast(`Power Goal ${elapsed} | ${status}`, "info", 4000)
      }, 5_000)
    } else if (goal?.status !== "active" && hb) {
      clearInterval(hb)
      hb = null
    }
  }

  return {
    config: async (cfg: any) => {
      cfg.command ??= {}
      cfg.command.powergoal = { template: "<objective>", description: DEFAULT_COMMAND_DESCRIPTION }
    },

    tool: {
      manage_goal: tool({
        description: "Set, complete, or block the active goal. The only way to exit the goal loop.",
        args: {
          set_status: z.enum(["active", "complete", "blocked"]).describe("Goal status to set"),
          goal_text: z.string().optional().describe("REQUIRED when set_status is 'active'. The goal objective to pursue."),
        },
        execute: async (args, _context) => {
          const { set_status: status, goal_text: text } = args
          const objective = (text ?? "").trim()

          if (status === "active") {
            if (!objective) return "Error: goal_text is required when setting status to 'active'."
            goal = { objective, status: "active", startedAt: Date.now(), followupCount: 0 }
            cancelDwell()
            isIdle = false
            inFlight = false
            refreshHb()
            toast(MSG_ARMED + ` — "${objective}"`, "info", 5000)
            await fireInitial()
            return `Goal active: ${objective}`
          }

          if (status === "complete") {
            if (!goal || goal.status !== "active") return "No active goal to complete."
            const obj = goal.objective
            const elapsed = fmtElapsed(Date.now() - goal.startedAt)
            clear()
            toast(`${MSG_COMPLETED} — ${obj} (${elapsed})`)
            return `Goal completed: ${obj}. Elapsed: ${elapsed}.`
          }

          if (status === "blocked") {
            if (!goal || goal.status !== "active") return "No active goal to block."
            const obj = goal.objective
            goal.status = "blocked"
            cancelDwell()
            inFlight = false
            if (hb) { clearInterval(hb); hb = null }
            toast(`${MSG_BLOCKED} — ${obj}`)
            return `Goal blocked: ${obj}`
          }

          return "Unknown status."
        },
      }),
    },

    event: async ({ event }: any) => {
      const t = event.type
      const p = event.properties || event.data || {}

      if (t === "message.updated") {
        // Assistant is producing — cancel any dwell (handles compaction noise)
        if (p?.info?.role === "assistant") {
          isIdle = false
          cancelDwell()
        }
        return
      }

      if (t === "session.idle") {
        isIdle = true
        inFlight = false
        startDwell()
      }

      if (t === "session.created") {
        // New chat started — auto-stop any active goal to prevent
        // follow-ups from leaking into the wrong session
        if (goal?.status === "active") {
          const obj = goal.objective
          clear()
          toast(`Goal auto-stopped (new session) — "${obj}"`)
        }
      }
    },

    "command.execute.before": async (input: any) => {
      if (input.command !== "powergoal") return

      const op = parseCommand((input.arguments ?? "").trim())

      if (op.kind === "status") {
        if (!goal) {
          toast(NO_GOAL, "error")
          throw new Error(HANDLED)
        }
        const elapsed = fmtElapsed(Date.now() - goal.startedAt)
        toast(`Power Goal\nStatus: ${goal.status}\nObjective: ${goal.objective}\nElapsed: ${elapsed}`)
        throw new Error(HANDLED)
      }

      if (op.kind === "stop") {
        if (!goal || goal.status !== "active") {
          toast("No active power goal to stop.", "error")
          throw new Error(HANDLED)
        }
        const obj = goal.objective
        clear()
        toast(`${MSG_STOPPED} — ${obj}`)
        throw new Error(HANDLED)
      }

      if (op.kind === "complete") {
        if (!goal || goal.status !== "active") {
          toast("No active power goal to complete.", "error")
          throw new Error(HANDLED)
        }
        const obj = goal.objective
        const elapsed = fmtElapsed(Date.now() - goal.startedAt)
        clear()
        toast(`${MSG_COMPLETED} — ${obj} (${elapsed})`)
        throw new Error(HANDLED)
      }

      // start
      if (goal?.status === "active") {
        const elapsed = fmtElapsed(Date.now() - goal.startedAt)
        toast(`Already pursuing: "${goal.objective}" (${elapsed})\n/powergoal stop first.`, "error")
        throw new Error(HANDLED)
      }

      goal = { objective: op.objective, status: "active", startedAt: Date.now(), followupCount: 0 }
      toast(MSG_ARMED, "info", 5000)
      refreshHb()
      // Defer fire so command handler throw doesn't race with TUI submission
      setTimeout(() => { if (goal?.status === "active") fireInitial() }, FIRE_DEFER_MS)
      startDwell()
      throw new Error(HANDLED)
    },
  }
}

export default PowerGoalPlugin
