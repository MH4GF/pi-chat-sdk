import { describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { attachPi } from "../src/index.js";
import { THREAD_ID, createBot, dm, echoFactory, fakeSession, lastPostedText, postedTexts, textDelta } from "./helpers.js";

const toolStart = (toolName: string, args: unknown): AgentSessionEvent =>
  ({ type: "tool_execution_start", toolCallId: "c1", toolName, args }) as unknown as AgentSessionEvent;
const toolEnd = (toolName: string, isError: boolean): AgentSessionEvent =>
  ({ type: "tool_execution_end", toolCallId: "c1", toolName, result: {}, isError }) as unknown as AgentSessionEvent;

describe("attachPi", () => {
  it("answers a DM with the streamed pi response", async () => {
    const { bot, adapter } = createBot();
    attachPi(bot, { cwd: "/tmp", createSession: echoFactory((t) => `you said: ${t}`) });

    await bot.processMessage(adapter, THREAD_ID, dm("hello"));

    expect(adapter).toHaveStartedTyping(THREAD_ID);
    expect(lastPostedText(adapter)).toBe("you said: hello");
  });

  it("reuses one session per thread and creates another for a different thread", async () => {
    const { bot, adapter } = createBot();
    const factory = echoFactory((t) => t);
    attachPi(bot, { cwd: "/tmp", createSession: factory });

    await bot.processMessage(adapter, THREAD_ID, dm("one"));
    await bot.processMessage(adapter, THREAD_ID, dm("two"));
    await bot.processMessage(adapter, "mock:D999:", dm("three"));

    expect(factory.created).toEqual([THREAD_ID, "mock:D999:"]);
  });

  it("ignores messages the authorize hook rejects and replies when it returns text", async () => {
    const { bot, adapter } = createBot();
    const factory = echoFactory((t) => t);
    attachPi(bot, {
      cwd: "/tmp",
      createSession: factory,
      authorize: (message) => (message.author.userId === "U1" ? true : message.author.userId === "U2" ? "not for you" : false),
    });

    await bot.processMessage(adapter, THREAD_ID, dm("hi", "U3"));
    expect(postedTexts(adapter)).toEqual([]);
    expect(factory.created).toEqual([]);

    await bot.processMessage(adapter, THREAD_ID, dm("hi", "U2"));
    expect(lastPostedText(adapter)).toBe("not for you");
    expect(factory.created).toEqual([]);
  });

  it("renders tool calls as their own paragraphs when showToolCalls is on", async () => {
    const { bot, adapter } = createBot();
    attachPi(bot, {
      cwd: "/tmp",
      showToolCalls: true,
      showToolResults: true,
      createSession: async () =>
        fakeSession(async (emit) => {
          emit(textDelta("Looking. "));
          emit(toolStart("bash", { command: "ls -la /very/long/path/that/keeps/going/on/and/on/and/on/forever" }));
          emit(toolEnd("bash", true));
          emit(textDelta("Done."));
        }),
    });

    await bot.processMessage(adapter, THREAD_ID, dm("go"));

    const text = lastPostedText(adapter) ?? "";
    expect(text).toContain("Looking.");
    expect(text).toMatch(/\n\n_bash_ command=ls -la .*…\n\n/);
    expect(text).toContain("_bash_ failed");
    expect(text.endsWith("Done.")).toBe(true);
  });

  it("hides tool calls by default", async () => {
    const { bot, adapter } = createBot();
    attachPi(bot, {
      cwd: "/tmp",
      createSession: async () =>
        fakeSession(async (emit) => {
          emit(toolStart("read", { path: "x" }));
          emit(textDelta("ok"));
        }),
    });
    await bot.processMessage(adapter, THREAD_ID, dm("go"));
    expect(lastPostedText(adapter)).toBe("ok");
  });

  it("posts a fallback when pi produced no text", async () => {
    const { bot, adapter } = createBot();
    attachPi(bot, { cwd: "/tmp", createSession: async () => fakeSession(async () => {}) });
    await bot.processMessage(adapter, THREAD_ID, dm("go"));
    expect(lastPostedText(adapter)).toBe("(no response)");
  });

  it("posts the error when prompt() rejects and keeps serving the thread", async () => {
    const { bot, adapter } = createBot();
    let calls = 0;
    attachPi(bot, {
      cwd: "/tmp",
      createSession: async () =>
        fakeSession(async (emit) => {
          calls += 1;
          if (calls === 1) throw new Error("model exploded");
          emit(textDelta("fine now"));
        }),
    });

    await bot.processMessage(adapter, THREAD_ID, dm("first"));
    expect(lastPostedText(adapter)).toBe("Error: model exploded");

    await bot.processMessage(adapter, THREAD_ID, dm("second"));
    expect(lastPostedText(adapter)).toBe("fine now");
  });

  it("retries session creation on the next message if the factory failed", async () => {
    const { bot, adapter } = createBot();
    let attempts = 0;
    attachPi(bot, {
      cwd: "/tmp",
      createSession: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("no model");
        return fakeSession(async (emit) => emit(textDelta("ok")));
      },
    });
    await bot.processMessage(adapter, THREAD_ID, dm("a"));
    expect(lastPostedText(adapter)).toBe("Error: no model");
    await bot.processMessage(adapter, THREAD_ID, dm("b"));
    expect(lastPostedText(adapter)).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("serializes turns within a thread even under the concurrent strategy", async () => {
    const { bot, adapter } = createBot({ concurrency: { strategy: "concurrent" } });
    const order: string[] = [];
    attachPi(bot, {
      cwd: "/tmp",
      createSession: async () =>
        fakeSession(async (emit, text) => {
          order.push(`start ${text}`);
          await new Promise((r) => setTimeout(r, 20));
          emit(textDelta(text));
          order.push(`end ${text}`);
        }),
    });

    await Promise.all([
      bot.processMessage(adapter, THREAD_ID, dm("a")),
      bot.processMessage(adapter, THREAD_ID, dm("b")),
    ]);

    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("caps concurrent turns across threads with maxConcurrentTurns", async () => {
    const { bot, adapter } = createBot({ concurrency: { strategy: "concurrent" } });
    let running = 0;
    let peak = 0;
    attachPi(bot, {
      cwd: "/tmp",
      maxConcurrentTurns: 1,
      createSession: async () =>
        fakeSession(async (emit, text) => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((r) => setTimeout(r, 20));
          emit(textDelta(text));
          running -= 1;
        }),
    });

    await Promise.all([
      bot.processMessage(adapter, "mock:D1:", dm("a")),
      bot.processMessage(adapter, "mock:D2:", dm("b")),
      bot.processMessage(adapter, "mock:D3:", dm("c")),
    ]);
    expect(peak).toBe(1);
  });

  it("disposes idle sessions after idleTimeoutMs and on dispose()", async () => {
    vi.useFakeTimers();
    try {
      const { bot, adapter } = createBot();
      const sessions: ReturnType<typeof fakeSession>[] = [];
      const attachment = attachPi(bot, {
        cwd: "/tmp",
        idleTimeoutMs: 1000,
        createSession: async () => {
          const s = fakeSession(async (emit) => emit(textDelta("ok")));
          sessions.push(s);
          return s;
        },
      });

      await bot.processMessage(adapter, THREAD_ID, dm("a"));
      expect(attachment.activeThreads()).toEqual([THREAD_ID]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sessions[0]?.disposed).toBe(true);
      expect(attachment.activeThreads()).toEqual([]);

      await bot.processMessage(adapter, THREAD_ID, dm("b"));
      expect(sessions).toHaveLength(2);
      await attachment.dispose();
      expect(sessions[1]?.disposed).toBe(true);

      await bot.processMessage(adapter, THREAD_ID, dm("c"));
      expect(sessions).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes the session path derived from the thread id to the factory", async () => {
    const { bot, adapter } = createBot();
    const seen: string[] = [];
    attachPi(bot, {
      cwd: "/work/dir",
      agentDir: "/agent",
      createSession: async (ctx) => {
        seen.push(ctx.sessionPath, ctx.sessionDir, ctx.agentDir, ctx.cwd);
        return fakeSession(async (emit) => emit(textDelta("ok")));
      },
    });
    await bot.processMessage(adapter, THREAD_ID, dm("a"));
    expect(seen).toEqual([
      "/agent/sessions/--work-dir--/chat-mock_D123.jsonl",
      "/agent/sessions/--work-dir--",
      "/agent",
      "/work/dir",
    ]);
  });
});
