import { join } from "node:path";
import { getAgentDir, type AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { Message, Thread } from "chat";
import { createDefaultSessionFactory } from "./pi-session.js";
import { defaultSessionDir, sessionFileName } from "./session-key.js";
import { defaultToolCallLine, defaultToolResultLine, runTurn } from "./stream.js";
import type { AttachPiOptions, PiAttachment, PiBot, PiSession, ToolCallInfo, ToolResultInfo } from "./types.js";

interface LiveSession {
  session: Promise<PiSession>;
  idleTimer?: ReturnType<typeof setTimeout>;
  /** Serializes turns within one thread regardless of the bot's concurrency strategy. */
  tail: Promise<void>;
}

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

export function attachPi(bot: PiBot, options: AttachPiOptions): PiAttachment {
  const agentDir = options.agentDir ?? getAgentDir();
  const sessionDir = options.sessionDir ?? defaultSessionDir(options.cwd, agentDir);
  const createSession = options.createSession ?? createDefaultSessionFactory();
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_MS;
  const logger = options.logger;
  const toolCallLine = pickFormatter(options.showToolCalls, defaultToolCallLine);
  const toolResultLine = pickFormatter(options.showToolResults, defaultToolResultLine);
  const slots = new Semaphore(options.maxConcurrentTurns ?? Number.POSITIVE_INFINITY);
  const live = new Map<string, LiveSession>();
  let disposed = false;

  function getSession(threadId: string): LiveSession {
    let entry = live.get(threadId);
    if (!entry) {
      const sessionPath = join(sessionDir, sessionFileName(threadId));
      const session = createSession({ threadId, cwd: options.cwd, sessionPath, sessionDir, agentDir });
      // Drop the entry if creation fails so the next message retries instead of caching the rejection.
      session.catch(() => { if (live.get(threadId) === entry) live.delete(threadId); });
      entry = { session, tail: Promise.resolve() };
      live.set(threadId, entry);
    }
    return entry;
  }

  function touch(threadId: string, entry: LiveSession): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (idleTimeoutMs <= 0) return;
    entry.idleTimer = setTimeout(() => {
      if (live.get(threadId) !== entry) return;
      live.delete(threadId);
      entry.session.then((s) => s.dispose()).catch(() => {});
      logger?.debug?.("pi-chat-sdk: disposed idle session", { threadId });
    }, idleTimeoutMs);
    entry.idleTimer.unref?.();
  }

  async function runOne(thread: Thread, text: string, entry: LiveSession): Promise<void> {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    const events: AgentSessionEvent[] = [];
    let error: unknown;
    try {
      if (!slots.available && options.busyMessage) await thread.post(options.busyMessage);
      const release = await slots.acquire();
      try {
        const session = await entry.session;
        await thread.startTyping();
        const turn = runTurn(session, text, {
          toolCallLine,
          toolResultLine,
          onEvent: (e) => { events.push(e); },
          signal: thread.signal,
        });
        let produced = false;
        const spy: AsyncIterable<string> = {
          async *[Symbol.asyncIterator]() {
            for await (const chunk of turn.text) { produced = true; yield chunk; }
          },
        };
        await thread.post(spy);
        await turn.done;
        if (!produced) await thread.post(options.emptyResponseMessage ?? "(no response)");
      } finally {
        release();
      }
    } catch (err) {
      error = err;
      logger?.error?.("pi-chat-sdk: turn failed", { threadId: thread.id, error: err });
      const message = options.formatError ? options.formatError(err) : `Error: ${errorMessage(err)}`;
      await thread.post(message).catch(() => {});
    } finally {
      touch(thread.id, entry);
      options.onTurnEnd?.(error === undefined ? { threadId: thread.id, events } : { threadId: thread.id, events, error });
    }
  }

  async function handle(thread: Thread, message: Message): Promise<void> {
    if (disposed) return;
    const verdict = options.authorize ? await options.authorize(message, thread) : true;
    if (verdict === false) {
      logger?.info?.("pi-chat-sdk: ignored unauthorized message", { threadId: thread.id, userId: message.author.userId });
      return;
    }
    if (typeof verdict === "string") {
      await thread.post(verdict);
      return;
    }
    const text = message.text.trim();
    if (!text) return;
    const entry = getSession(thread.id);
    const run = entry.tail.then(() => runOne(thread, text, entry));
    entry.tail = run.catch(() => {});
    await run;
  }

  const handlers = { directMessage: true, mention: true, subscribed: false, ...options.handlers };
  if (handlers.directMessage) bot.onDirectMessage((thread, message) => handle(thread, message));
  if (handlers.mention) bot.onNewMention((thread, message) => handle(thread, message));
  if (handlers.subscribed) bot.onSubscribedMessage((thread, message) => handle(thread, message));

  return {
    handle,
    activeThreads: () => [...live.keys()],
    async dispose() {
      disposed = true;
      const entries = [...live.values()];
      live.clear();
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.idleTimer) clearTimeout(entry.idleTimer);
          try { (await entry.session).dispose(); } catch { /* creation failed; nothing to dispose */ }
        }),
      );
    },
  };
}

function pickFormatter<T extends ToolCallInfo | ToolResultInfo>(
  setting: boolean | ((info: T) => string | undefined) | undefined,
  fallback: (info: T) => string | undefined,
): ((info: T) => string | undefined) | undefined {
  if (!setting) return undefined;
  return setting === true ? fallback : setting;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class Semaphore {
  private waiting: Array<() => void> = [];
  private used = 0;
  constructor(private readonly max: number) {}
  get available(): boolean { return this.used < this.max; }
  async acquire(): Promise<() => void> {
    if (this.used >= this.max) await new Promise<void>((r) => this.waiting.push(r));
    this.used += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used -= 1;
      this.waiting.shift()?.();
    };
  }
}
