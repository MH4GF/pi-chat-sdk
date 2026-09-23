import { Chat, type Adapter, type ChatConfig } from "chat";
import { createMockAdapter, createMockState, createTestMessage } from "@chat-adapter/tests";
import type { Mock } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { PiSession, PiSessionFactory } from "../src/index.js";

export const THREAD_ID = "mock:D123:";

export function createBot(overrides: Partial<ChatConfig> = {}) {
  const adapter = createMockAdapter("mock", { isDM: () => true });
  const bot = new Chat({
    userName: "pi-bot",
    adapters: { mock: adapter },
    state: createMockState(),
    streamingUpdateIntervalMs: 0,
    ...overrides,
  });
  return { bot, adapter };
}

export function dm(text: string, userId = "U1") {
  return createTestMessage(`m-${Math.random().toString(36).slice(2)}`, text, {
    threadId: THREAD_ID,
    author: { userId, userName: "user", fullName: "User", isBot: false, isMe: false },
  });
}

/** Text of every post/edit the mock adapter received, in call order. */
export function postedTexts(adapter: Adapter): string[] {
  const calls = [
    ...(adapter.postMessage as unknown as Mock).mock.calls.map((c) => c[1]),
    ...(adapter.editMessage as unknown as Mock).mock.calls.map((c) => c[2]),
  ];
  return calls.map((m) => (typeof m === "string" ? m : (m?.markdown ?? m?.text ?? JSON.stringify(m))));
}

export function lastPostedText(adapter: Adapter): string | undefined {
  return postedTexts(adapter).at(-1);
}

type Script = (emit: (e: AgentSessionEvent) => void, text: string) => Promise<void>;

/**
 * Fake pi session. `script` receives an emitter and the prompt text and drives events;
 * `prompt()` resolves when the script finishes, mirroring pi's real prompt() semantics.
 */
export function fakeSession(script: Script): PiSession & { prompts: string[]; disposed: boolean; aborted: number } {
  const listeners = new Set<(e: AgentSessionEvent) => void>();
  const emit = (e: AgentSessionEvent) => { for (const l of listeners) l(e); };
  const s = {
    prompts: [] as string[],
    disposed: false,
    aborted: 0,
    isStreaming: false,
    subscribe(listener: (e: AgentSessionEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async prompt(text: string) {
      s.prompts.push(text);
      s.isStreaming = true;
      try { await script(emit, text); } finally { s.isStreaming = false; }
    },
    async abort() { s.aborted += 1; },
    dispose() { s.disposed = true; },
  };
  return s;
}

export const textDelta = (delta: string): AgentSessionEvent =>
  ({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta, contentIndex: 0 } }) as unknown as AgentSessionEvent;

export const echoFactory = (reply: (text: string) => string): PiSessionFactory & { created: string[] } => {
  const created: string[] = [];
  const factory: PiSessionFactory = async ({ threadId }) => {
    created.push(threadId);
    return fakeSession(async (emit, text) => {
      for (const word of reply(text).split(/(?<= )/)) emit(textDelta(word));
    });
  };
  return Object.assign(factory, { created });
};
