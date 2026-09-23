import { mkdirSync } from "node:fs";
import {
  createAgentSession,
  SessionManager,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import type { PiSession, PiSessionContext, PiSessionFactory } from "./types.js";

export interface DefaultSessionFactoryOptions {
  /** Extra options forwarded to `createAgentSession` (model, thinkingLevel, tools, customTools ...). */
  sessionOptions?: Omit<CreateAgentSessionOptions, "cwd" | "agentDir" | "sessionManager">;
}

/**
 * Default factory: one pi `AgentSession` per thread, persisted to `context.sessionPath`.
 * Extensions are bound with no UI, so `ctx.ui.confirm()` resolves `false` and
 * `select`/`input` resolve `undefined` (pi's headless no-op context).
 */
export function createDefaultSessionFactory(options: DefaultSessionFactoryOptions = {}): PiSessionFactory {
  return async (context: PiSessionContext): Promise<PiSession> => {
    mkdirSync(context.sessionDir, { recursive: true });
    const sessionManager = SessionManager.open(context.sessionPath, context.sessionDir, context.cwd);
    const { session } = await createAgentSession({
      ...options.sessionOptions,
      cwd: context.cwd,
      agentDir: context.agentDir,
      sessionManager,
    });
    // createAgentSession does not bind extensions; without this, `session_start` never fires
    // and extension-provided tools (MCP adapter, worktree ...) stay inert.
    await session.bindExtensions({});
    return session;
  };
}
