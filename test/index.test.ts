import { describe, expect, test, vi, afterEach, beforeEach } from "vitest"
import {
  parseCommand,
  fmtElapsed,
  buildInitialMessage,
  buildFollowupMessage,
} from "../src/test-helpers"

// ═══════════════════════════════════════════
//  parseCommand
// ═══════════════════════════════════════════

describe("parseCommand", () => {
  test("empty input returns status", () => {
    expect(parseCommand("")).toEqual({ kind: "status" })
    expect(parseCommand("   ")).toEqual({ kind: "status" })
  })

  test("'stop' returns stop command", () => {
    expect(parseCommand("stop")).toEqual({ kind: "stop" })
    expect(parseCommand(" STOP ")).toEqual({ kind: "stop" })
  })

  test("'complete' returns complete command", () => {
    expect(parseCommand("complete")).toEqual({ kind: "complete" })
    expect(parseCommand(" COMPLETE ")).toEqual({ kind: "complete" })
  })

  test("any other text returns start with objective", () => {
    expect(parseCommand("Implement auth module")).toEqual({
      kind: "start",
      objective: "Implement auth module",
    })
  })

  test("multiline objective preserved", () => {
    expect(parseCommand("line1\nline2\nline3")).toEqual({
      kind: "start",
      objective: "line1\nline2\nline3",
    })
  })
})

// ═══════════════════════════════════════════
//  fmtElapsed
// ═══════════════════════════════════════════

describe("fmtElapsed", () => {
  test("seconds only", () => {
    expect(fmtElapsed(0)).toBe("0s")
    expect(fmtElapsed(30_000)).toBe("30s")
    expect(fmtElapsed(59_000)).toBe("59s")
  })

  test("minutes only", () => {
    expect(fmtElapsed(60_000)).toBe("1m")
    expect(fmtElapsed(120_000)).toBe("2m")
    expect(fmtElapsed(3_540_000)).toBe("59m")
  })

  test("hours exact", () => {
    expect(fmtElapsed(3_600_000)).toBe("1h")
    expect(fmtElapsed(7_200_000)).toBe("2h")
  })

  test("hours and minutes", () => {
    expect(fmtElapsed(3_660_000)).toBe("1h 1m")
    expect(fmtElapsed(5_400_000)).toBe("1h 30m")
  })
})

// ═══════════════════════════════════════════
//  buildInitialMessage
// ═══════════════════════════════════════════

describe("buildInitialMessage", () => {
  test("produces correct initial message format", () => {
    const msg = buildInitialMessage("Implement auth module")
    expect(msg).toBe(
      "# Started goal:\nImplement auth module",
    )
  })

  test("preserves multiline objectives", () => {
    const msg = buildInitialMessage("step 1\nstep 2")
    expect(msg).toBe(
      "# Started goal:\nstep 1\nstep 2",
    )
  })
})

// ═══════════════════════════════════════════
//  buildFollowupMessage
// ═══════════════════════════════════════════

describe("buildFollowupMessage", () => {
  test("first follow-up (n=1) omits completion hint", () => {
    const msg = buildFollowupMessage("Implement auth module", 1)
    expect(msg).toBe(
      "# Pursuing goal:\nImplement auth module",
    )
  })

  test("second follow-up (n=2) shows completion hint", () => {
    const msg = buildFollowupMessage("Implement auth module", 2)
    expect(msg).toBe(
      "# Pursuing goal:\nImplement auth module\n\n(use 'manage_goal' for completion)",
    )
  })

  test("third+ follow-up also shows hint", () => {
    const msg = buildFollowupMessage("test", 5)
    expect(msg).toContain("(use 'manage_goal' for completion)")
  })
})

// ═══════════════════════════════════════════
//  Plugin smoke test
// ═══════════════════════════════════════════

describe("PowerGoalPlugin", () => {
  test("package entrypoint exports plugin", async () => {
    const mod = await import("../src/index")
    expect(mod).toHaveProperty("PowerGoalPlugin")
    expect(mod).toHaveProperty("default")
  })

  test("plugin instantiates and exposes hooks", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []
    const prompts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async (input: any) => void prompts.push(input.body.text),
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // All expected hooks present
    expect(hooks).toHaveProperty("config")
    expect(hooks).toHaveProperty("tool")
    expect(hooks.tool).toHaveProperty("manage_goal")
    expect(hooks).toHaveProperty("event")
    expect(hooks).toHaveProperty("command.execute.before")
  })

  test("/powergoal <objective> starts goal and fires initial message after short dwell", async () => {
    vi.useFakeTimers()
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []
    const prompts: string[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async (input: any) => void prompts.push(input.body.text),
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // First signal idle so the plugin knows we're already idle
    await hooks.event?.({ event: { type: "session.idle" } })

    // /powergoal must silently clear the original command's output parts
    // (no throw — that breaks the opencode plugin contract post-refactor)
    const output = { parts: [{ type: "text" as const, text: "default template" }] }
    await hooks["command.execute.before"]?.(
      {
        command: "powergoal",
        sessionID: "s1",
        arguments: "Implement auth",
      },
      output,
    )
    expect(output.parts).toEqual([])

    // Advance past the 3s short dwell to trigger fireInitial via pendingInitial
    await vi.advanceTimersByTimeAsync(3_100)

    // Initial message fired after short dwell
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain("# Started goal:")
    expect(prompts[0]).toContain("Implement auth")

    // Toast confirms arming
    expect(toasts.some((t) => t.message.includes("armed"))).toBe(true)

    vi.useRealTimers()
  })

  test("/powergoal stop clears active goal", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Start a goal
    {
      const out = { parts: [{ type: "text" as const, text: "t" }] }
      await hooks["command.execute.before"]?.(
        { command: "powergoal", arguments: "test goal" },
        out,
      )
      expect(out.parts).toEqual([])
    }

    // Stop it
    {
      const out = { parts: [{ type: "text" as const, text: "t" }] }
      await hooks["command.execute.before"]?.(
        { command: "powergoal", arguments: "stop" },
        out,
      )
      expect(out.parts).toEqual([])
    }

    expect(toasts.some((t) => t.message.includes("stopped"))).toBe(true)
  })

  test("/powergoal (empty) shows status when goal active", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Start a goal
    {
      const out = { parts: [{ type: "text" as const, text: "t" }] }
      await hooks["command.execute.before"]?.(
        { command: "powergoal", arguments: "status test" },
        out,
      )
      expect(out.parts).toEqual([])
    }

    // Check status
    {
      const out = { parts: [{ type: "text" as const, text: "t" }] }
      await hooks["command.execute.before"]?.(
        { command: "powergoal", arguments: "" },
        out,
      )
      expect(out.parts).toEqual([])
    }

    expect(toasts.some((t) => t.message.includes("Status: active"))).toBe(true)
    expect(toasts.some((t) => t.message.includes("status test"))).toBe(true)
  })

  test("/powergoal (empty) shows no-goal when idle", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    const out = { parts: [{ type: "text" as const, text: "t" }] }
    await hooks["command.execute.before"]?.(
      { command: "powergoal", arguments: "" },
      out,
    )
    expect(out.parts).toEqual([])

    expect(toasts.some((t) => t.message.includes("No active power goal"))).toBe(true)
  })

  test("cannot start a second goal while one is active", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Start first goal
    {
      const out = { parts: [{ type: "text" as const, text: "t" }] }
      await hooks["command.execute.before"]?.(
        { command: "powergoal", arguments: "first goal" },
        out,
      )
      expect(out.parts).toEqual([])
    }

    // Try to start second
    {
      const out = { parts: [{ type: "text" as const, text: "t" }] }
      await hooks["command.execute.before"]?.(
        { command: "powergoal", arguments: "second goal" },
        out,
      )
      expect(out.parts).toEqual([])
    }

    expect(toasts.some((t) => t.message.includes("Already pursuing"))).toBe(true)
  })

  test("manage_goal tool: active requires goal_text", async () => {
    const { PowerGoalPlugin } = await import("../src/index")

    const client = {
      tui: {
        showToast: async () => undefined,
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    const result = await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "",
    })

    expect(result).toContain("goal_text is required")
  })

  test("manage_goal tool: active sets goal and fires", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []
    const prompts: string[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async (input: any) => void prompts.push(input.body.text),
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    const result = await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "tool-set goal",
    })

    expect(result).toContain("Goal active: tool-set goal")
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain("tool-set goal")
  })

  test("manage_goal tool: complete works after active", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Set active
    await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "complete me",
    })

    // Complete
    const result = await hooks.tool.manage_goal.execute({
      set_status: "complete",
    })

    expect(result).toContain("Goal completed: complete me")
    expect(toasts.some((t) => t.message.includes("completed"))).toBe(true)
  })

  test("manage_goal tool: block works after active", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Set active
    await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "block me",
    })

    // Block
    const result = await hooks.tool.manage_goal.execute({
      set_status: "blocked",
    })

    expect(result).toContain("Goal blocked: block me")
    expect(toasts.some((t) => t.message.includes("blocked"))).toBe(true)
  })

  test("manage_goal tool: complete/block with no active goal returns error", async () => {
    const { PowerGoalPlugin } = await import("../src/index")

    const client = {
      tui: {
        showToast: async () => undefined,
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    const completeResult = await hooks.tool.manage_goal.execute({
      set_status: "complete",
    })
    expect(completeResult).toContain("No active goal to complete")

    const blockResult = await hooks.tool.manage_goal.execute({
      set_status: "blocked",
    })
    expect(blockResult).toContain("No active goal to block")
  })

  test("event: message.updated (assistant) cancels dwell", async () => {
    const { PowerGoalPlugin } = await import("../src/index")

    const client = {
      tui: {
        showToast: async () => undefined,
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Start a goal
    await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "dwell test",
    })

    // Send assistant message.updated (should not throw)
    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: { role: "assistant", sessionID: "s1" },
        },
      },
    } as any)
  })

  test("event: session.idle starts dwell (no throw)", async () => {
    const { PowerGoalPlugin } = await import("../src/index")

    const client = {
      tui: {
        showToast: async () => undefined,
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Start a goal
    await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "idle test",
    })

    // Fire idle event (should arm dwell without throwing)
    await hooks.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "s1" },
      },
    } as any)
  })

  test("event: session.created auto-stops active goal", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Start a goal
    await hooks.tool.manage_goal.execute({
      set_status: "active",
      goal_text: "cross-session goal",
    })

    // Fire session.created — goal should auto-stop
    await hooks.event?.({
      event: {
        type: "session.created",
        data: { sessionID: "new-session-2" },
      },
    } as any)

    expect(toasts.some((t) => t.message.includes("auto-stopped"))).toBe(true)
    expect(toasts.some((t) => t.message.includes("cross-session goal"))).toBe(true)

    // Verify goal is cleared — trying to stop should say no active goal
    const result = await hooks.tool.manage_goal.execute({
      set_status: "complete",
    })
    expect(result).toContain("No active goal to complete")
  })

  test("event: session.created with no active goal is no-op", async () => {
    const { PowerGoalPlugin } = await import("../src/index")
    const toasts: any[] = []

    const client = {
      tui: {
        showToast: async (input: any) => void toasts.push(input.body),
        clearPrompt: async () => undefined,
        appendPrompt: async () => undefined,
        submitPrompt: async () => undefined,
      },
    }

    const hooks = await PowerGoalPlugin({ client } as any)

    // Fire session.created with no goal — should be silent
    await hooks.event?.({
      event: {
        type: "session.created",
        data: { sessionID: "s2" },
      },
    } as any)

    expect(toasts.some((t) => t.message.includes("auto-stopped"))).toBe(false)
  })
})
