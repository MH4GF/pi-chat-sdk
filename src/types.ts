import type { AgentSessionEvent, PromptOptions } from "@earendil-works/pi-coding-agent";
import type { Chat, Logger, Message, Thread } from "chat";

/** The slice of Chat SDK's `Chat` this package hooks into. */
export type PiBot = Pick<Chat, "onDirectMessage" | "onNewMention" | "onSubscribedMessage">;

/**
 * The slice of pi's `AgentSession` this package depends on.
 * Kept minimal so tests (and other harnesses) can supply a fake.
 */
export interface PiSession {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  abort(): Promise<void>;
  dispose(): void;
  readonly isStreaming: boolean;
}

export interface PiSessionContext {
  /** Chat SDK thread id (`<adapter>:<channel>:<thread>`). */
  threadId: string;
  /** Working directory pi runs in for this thread. */
  cwd: string;
  /** Session file the thread maps to (`.jsonl`). Created on first turn, reused on later ones. */
  sessionPath: string;
  /** Directory holding the session file. */
  sessionDir: string;
  /** pi agent dir (`~/.pi/agent` unless overridden). */
  agentDir: string;
}

export type PiSessionFactory = (context: PiSessionContext) => Promise<PiSession>;

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolResultInfo extends ToolCallInfo {
  isError: boolean;
  result: unknown;
}

export interface AttachPiOptions {
  /** Working directory pi runs in. Context files (AGENTS.md / CLAUDE.md) and skills resolve from here. */
  cwd: string;
  /** pi agent dir. Default: `getAgentDir()` (`~/.pi/agent`, or `PI_CODING_AGENT_DIR`). */
  agentDir?: string;
  /**
   * Directory for session files. Default: pi's own layout for `cwd`
   * (`<agentDir>/sessions/--<encoded cwd>--/`), so `pi --resume` in that cwd lists chat sessions.
   */
  sessionDir?: string;
  /** Override how a pi session is created. Default: `createAgentSession` + `bindExtensions`. */
  createSession?: PiSessionFactory;
  /**
   * Decide whether a message is served. Default: everyone.
   * Return `false` to ignore silently, or a string to reply with that text instead of running pi.
   */
  authorize?: (message: Message, thread: Thread) => boolean | string | Promise<boolean | string>;
  /** Which Chat SDK hooks to attach. Default: direct messages and new mentions. */
  handlers?: {
    directMessage?: boolean;
    mention?: boolean;
    /** Follow-up messages in threads the bot is subscribed to (needs `thread.subscribe()`). */
    subscribed?: boolean;
  };
  /**
   * Show tool calls inline. `false` hides them (default). `true` uses a one-line summary.
   * A function returns the line to show, or `undefined` to skip that call.
   */
  showToolCalls?: boolean | ((info: ToolCallInfo) => string | undefined);
  /** Same for tool results. Default: hidden. */
  showToolResults?: boolean | ((info: ToolResultInfo) => string | undefined);
  /** Dispose a session after this much idle time. Default: 30 minutes. `0` keeps sessions forever. */
  idleTimeoutMs?: number;
  /** Cap on turns running at once across all threads. Default: unlimited. Excess turns wait. */
  maxConcurrentTurns?: number;
  /** Posted when a turn has to wait for a slot (only when `maxConcurrentTurns` is set). */
  busyMessage?: string;
  /** Posted when pi produced no text. Default: `"(no response)"`. */
  emptyResponseMessage?: string;
  /** Turn an error into the text posted to the thread. Default: `Error: <message>`. */
  formatError?: (error: unknown) => string;
  /** Called after each turn with the raw events, for tracing or metrics. */
  onTurnEnd?: (info: { threadId: string; events: AgentSessionEvent[]; error?: unknown }) => void;
  logger?: Pick<Logger, "info" | "warn" | "error" | "debug">;
}

export interface PiAttachment {
  /** Dispose every live session and stop idle timers. */
  dispose(): Promise<void>;
  /** Thread ids with a live session. */
  activeThreads(): string[];
  /** Run one turn for an arbitrary thread/text pair (used by handlers; handy for tests and custom hooks). */
  handle(thread: Thread, message: Message): Promise<void>;
}
