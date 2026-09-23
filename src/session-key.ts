import { join, resolve } from "node:path";

/** Turn a Chat SDK thread id into a filesystem-safe session file name. */
export function sessionFileName(threadId: string): string {
  const safe = threadId.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+$/, "");
  return `chat-${safe || "root"}.jsonl`;
}

/**
 * pi's default per-cwd session directory. Mirrors `getDefaultSessionDirPath` in
 * pi-coding-agent (not exported), so `pi --resume` in `cwd` sees these sessions.
 */
export function defaultSessionDir(cwd: string, agentDir: string): string {
  const resolvedCwd = resolve(cwd);
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(resolve(agentDir), "sessions", safePath);
}
