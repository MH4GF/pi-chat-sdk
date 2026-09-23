import { describe, expect, it } from "vitest";
import { runTurn } from "../src/index.js";
import { fakeSession, textDelta } from "./helpers.js";

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

describe("runTurn", () => {
  it("yields text deltas in order and ends when prompt() resolves", async () => {
    const session = fakeSession(async (emit) => {
      emit(textDelta("a"));
      await new Promise((r) => setTimeout(r, 5));
      emit(textDelta("b"));
    });
    const turn = runTurn(session, "hi");
    expect(await collect(turn.text)).toEqual(["a", "b"]);
    await turn.done;
    expect(session.prompts).toEqual(["hi"]);
  });

  it("rethrows the prompt error from the iterable", async () => {
    const session = fakeSession(async () => { throw new Error("boom"); });
    const turn = runTurn(session, "hi");
    await expect(collect(turn.text)).rejects.toThrow("boom");
    await expect(turn.done).rejects.toThrow("boom");
  });

  it("aborts the session when the signal fires", async () => {
    const controller = new AbortController();
    const session = fakeSession(async (emit) => {
      emit(textDelta("a"));
      await new Promise((r) => setTimeout(r, 5));
    });
    const turn = runTurn(session, "hi", { signal: controller.signal });
    controller.abort();
    await turn.done;
    expect(session.aborted).toBe(1);
  });
});
