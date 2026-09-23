import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { createDefaultSessionFactory, defaultSessionDir, sessionFileName } from "../src/index.js";

// Real pi SDK, no model: proves the session file mapping and bindExtensions survive pi upgrades.
const root = mkdtempSync(join(tmpdir(), "pi-chat-sdk-"));
const agentDir = join(root, "agent");
const cwd = join(root, "work");
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("createDefaultSessionFactory", () => {
  it("opens the session at the derived path and reopens the same file", async () => {
    const sessionDir = defaultSessionDir(cwd, agentDir);
    const sessionPath = join(sessionDir, sessionFileName("mock:D1:"));
    const factory = createDefaultSessionFactory();

    const first = (await factory({ threadId: "mock:D1:", cwd, sessionPath, sessionDir, agentDir })) as AgentSession;
    expect(first.sessionManager.getSessionFile()).toBe(sessionPath);
    expect(first.sessionManager.getCwd()).toBe(cwd);
    expect(first.isIdle).toBe(true);
    first.dispose();

    const second = (await factory({ threadId: "mock:D1:", cwd, sessionPath, sessionDir, agentDir })) as AgentSession;
    expect(second.sessionManager.getSessionFile()).toBe(sessionPath);
    second.dispose();
  });
});
