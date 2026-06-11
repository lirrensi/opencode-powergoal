// ═══════════════════════════════════════════
//  Power Goal — test helpers.
//  Exported for unit tests. Stripped on deploy.
// ═══════════════════════════════════════════

export type GoalState = {
  objective: string
  status: "active" | "complete" | "blocked"
  startedAt: number
}

export const DEFAULT_COMMAND_DESCRIPTION = "start or manage a persistent goal loop"

const GOAL_START_PREFIX = "# Started goal:"
const GOAL_FOLLOWUP_PREFIX = "# Pursuing goal:"
const GOAL_COMPLETION_HINT = "(use 'manage_goal' for completion)"

export function parseCommand(input: string):
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

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (s < 60) return `${s}s`
  if (m < 60) return `${m}m`
  if (m % 60 === 0) return `${h}h`
  return `${h}h ${m % 60}m`
}

export function buildInitialMessage(objective: string): string {
  return `${GOAL_START_PREFIX}\n${objective}`
}

export function buildFollowupMessage(objective: string, followupCount: number): string {
  const hint = followupCount >= 2 ? `\n\n${GOAL_COMPLETION_HINT}` : ""
  return `${GOAL_FOLLOWUP_PREFIX}\n${objective}${hint}`
}
