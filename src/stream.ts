import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { PiSession, ToolCallInfo, ToolResultInfo } from "./types.js";

export interface TurnOptions {
  signal?: AbortSignal | undefined;
  toolCallLine?: ((info: ToolCallInfo) => string | undefined) | undefined;
  toolResultLine?: ((info: ToolResultInfo) => string | undefined) | undefined;
  /** Receives every event, for tracing. */
  onEvent?: ((event: AgentSessionEvent) => void) | undefined;
}

export interface TurnResult {
  /** Resolves when `session.prompt()` settles. Rejects with the prompt error, if any. */
  done: Promise<void>;
  /** Text chunks in arrival order: model deltas plus optional tool lines. */
  text: AsyncIterable<string>;
}

/**
 * Run one pi turn and expose its output as an async iterable of text chunks.
 * The iterable ends when `prompt()` resolves; aborting `signal` aborts the session.
 */
export function runTurn(session: PiSession, text: string, options: TurnOptions = {}): TurnResult {
  const queue: string[] = [];
  let closed = false;
  let failure: unknown;
  let wake: (() => void) | undefined;
  const notify = () => { wake?.(); wake = undefined; };
  const push = (chunk: string) => { if (chunk) { queue.push(chunk); notify(); } };

  const unsubscribe = session.subscribe((event) => {
    options.onEvent?.(event);
    if (event.type === "message_update") {
      const inner = event.assistantMessageEvent;
      if (inner.type === "text_delta") push(inner.delta);
      return;
    }
    if (event.type === "tool_execution_start" && options.toolCallLine) {
      const line = options.toolCallLine({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
      if (line) push(paragraph(line));
      return;
    }
    if (event.type === "tool_execution_end" && options.toolResultLine) {
      const line = options.toolResultLine({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: undefined,
        isError: event.isError,
        result: event.result,
      });
      if (line) push(paragraph(line));
    }
  });

  const onAbort = () => { void session.abort(); };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const done = session
    .prompt(text)
    .catch((error: unknown) => { failure = error; throw error; })
    .finally(() => {
      closed = true;
      unsubscribe();
      options.signal?.removeEventListener("abort", onAbort);
      notify();
    });
  // The caller awaits `done` separately; avoid an unhandled rejection if it does so late.
  done.catch(() => {});

  const textIterable: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (queue.length > 0) { yield queue.shift() as string; continue; }
        if (closed) {
          if (failure !== undefined) throw failure;
          return;
        }
        await new Promise<void>((r) => { wake = r; });
      }
    },
  };

  return { done, text: textIterable };
}

function paragraph(line: string): string {
  return `\n\n${line}\n\n`;
}

export function defaultToolCallLine(info: ToolCallInfo): string {
  return `_${info.toolName}_ ${summarizeArgs(info.args)}`.trimEnd();
}

export function defaultToolResultLine(info: ToolResultInfo): string | undefined {
  return info.isError ? `_${info.toolName}_ failed` : undefined;
}

function summarizeArgs(args: unknown): string {
  if (args === null || typeof args !== "object") return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const shown = typeof value === "string" ? value : JSON.stringify(value);
    if (shown === undefined) continue;
    parts.push(`${key}=${truncate(shown.replace(/\s+/g, " "), 60)}`);
  }
  return parts.join(" ");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
