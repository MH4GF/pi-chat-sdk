import { describe, expect, it } from "vitest";
import { defaultSessionDir, sessionFileName } from "../src/index.js";

describe("sessionFileName", () => {
  it("keeps thread ids readable and filesystem safe", () => {
    expect(sessionFileName("slack:D0123:")).toBe("chat-slack_D0123.jsonl");
    expect(sessionFileName("slack:C1:1712.34")).toBe("chat-slack_C1_1712.34.jsonl");
    expect(sessionFileName("a/b\\c")).toBe("chat-a_b_c.jsonl");
    expect(sessionFileName("")).toBe("chat-root.jsonl");
  });
});

describe("defaultSessionDir", () => {
  it("matches pi's per-cwd layout", () => {
    expect(defaultSessionDir("/Users/me/proj", "/Users/me/.pi/agent")).toBe(
      "/Users/me/.pi/agent/sessions/--Users-me-proj--",
    );
  });
});
