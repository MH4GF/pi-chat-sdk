# pi-chat-sdk

[![npm](https://img.shields.io/npm/v/pi-chat-sdk?style=flat-square)](https://www.npmjs.com/package/pi-chat-sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/MH4GF/pi-chat-sdk/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/MH4GF/pi-chat-sdk/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

Run [pi](https://pi.dev), the minimal coding agent, as a Slack, Telegram or Discord bot. One chat thread is one persistent pi session, pi's output streams into the chat message, and `pi --resume` opens the same conversation in the TUI.

https://github.com/user-attachments/assets/9938fb84-5334-4e70-a288-d949e1655a06

*pi answering in Slack, then the same conversation opened with `pi --resume` in the TUI.*

pi-chat-sdk is a thin layer between pi's SDK and [Chat SDK](https://chat-sdk.dev), Vercel's adapter layer for Slack, Teams, Discord, Telegram, Google Chat and more. It deliberately stops there. Persona, tools, MCP servers, sandboxing, models and deployment stay in your bot and your `~/.pi/agent` config, exactly as they do for the pi TUI.

## Why

- **A plain daemon.** It uses pi's `createAgentSession`, not a pi extension living inside a TUI process. No tmux, no stdin tricks. Run it under launchd, systemd or Docker.
- **Thread = session.** Session files go in pi's own per-cwd directory, so a chat conversation is a normal pi session: resumable in the TUI, forkable, compacted by pi. Want a fresh session? Start a new thread. No `/new` command needed.
- **Your pi config, unchanged.** `AGENTS.md`, skills, extensions, MCP servers, `models.json` and the default model all apply. A local model through llama.cpp or Ollama works the same as a hosted one.
- **Any Chat SDK adapter.** Slack's Agent experience (native streaming, stop button, session titles) is a flag on the adapter. Telegram needs only a bot token.
- **Testable.** Swap pi for a fake with `createSession` and drive the bot with Chat SDK's mock adapter and matchers.

## Install

```bash
npm install pi-chat-sdk chat @chat-adapter/slack @chat-adapter/state-memory @earendil-works/pi-coding-agent
```

`chat` and `@earendil-works/pi-coding-agent` are peer dependencies. Pin the pi version you have tested; pi's SDK changes between minors.

## Use

```ts
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { attachPi } from "pi-chat-sdk";

const bot = new Chat({
  userName: "pi",
  adapters: {
    slack: createSlackAdapter({ mode: "socket", appToken: process.env.SLACK_APP_TOKEN!, botToken: process.env.SLACK_BOT_TOKEN! }),
  },
  state: createMemoryState(),
  // Chat SDK drops messages that arrive mid-turn by default. attachPi serializes turns per
  // thread itself, so let Chat SDK run handlers concurrently (see "Things that bit us").
  concurrency: { strategy: "concurrent" },
  // Post-and-edit streaming hits Slack's chat.update rate limit at the 500 ms default.
  streamingUpdateIntervalMs: 1500,
});

attachPi(bot, {
  cwd: "/path/to/project",
  authorize: (message) => allowedUsers.has(message.author.userId),
  showToolCalls: true,
});

await bot.initialize();
```

`attachPi` registers `onDirectMessage` and `onNewMention` handlers. Each message runs one pi turn in the session that belongs to the thread and streams the reply back with `thread.post(AsyncIterable)`.

Complete, runnable bots with `.env.example` files are in [`examples/`](./examples):

| Example | Transport | Status |
| --- | --- | --- |
| [Slack](./examples/slack) | Socket Mode. Ships app manifests for the Agent experience and for a plain bot | Runs in production |
| [Telegram](./examples/telegram) | Long polling. A bot token is all you need | Untested |
| [Discord](./examples/discord) | Gateway WebSocket | Untested |

Other Chat SDK adapters (Teams, Google Chat, ...) get post-and-edit streaming from Chat SDK and should work the same way, but have not been run by the author. Reports welcome.

## What it does

- **Thread = session.** Session files live in pi's own per-cwd directory (`~/.pi/agent/sessions/--<cwd>--/chat-<thread id>.jsonl`), so `pi --resume` in that cwd can open a chat conversation in the TUI.
- **Streaming.** Text deltas are pushed as they arrive. Adapters with native streaming use it; others get post-and-edit from Chat SDK.
- **Tool calls.** Hidden by default. `showToolCalls: true` renders a one-line summary per call as its own paragraph; pass a function for custom formatting or to skip some tools.
- **Cancellation.** `thread.signal` is passed to every pi turn, so whatever fires it aborts the turn. Chat SDK fires it from Slack's stop button under the Agent experience.
- **Authorization.** `authorize(message, thread)` returns `true`, `false` (ignore silently) or a string (reply with it instead of running pi).
- **Serialization.** Turns within one thread never overlap, whatever `concurrency` strategy the bot uses. `maxConcurrentTurns` caps turns across threads.
- **Lifecycle.** Sessions are disposed after `idleTimeoutMs` (30 minutes by default) and recreated from the session file on the next message. `attachment.dispose()` tears everything down.
- **Failures.** A rejected turn ends the streamed message with `Error: <message>` (customize with `formatError`) and the thread keeps working. A model that produced no text gets `emptyResponseMessage` instead. Either way the streaming placeholder Chat SDK posted is edited, never left dangling.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `cwd` | required | Where pi runs. Context files (`AGENTS.md`, `CLAUDE.md`), skills and `.pi/` config resolve from here |
| `agentDir` | `getAgentDir()` | `~/.pi/agent` or `PI_CODING_AGENT_DIR` |
| `sessionDir` | pi's dir for `cwd` | Override to keep chat sessions apart from TUI ones |
| `createSession` | `createDefaultSessionFactory()` | Replace to customize `createAgentSession` (model, tools, custom tools) or to fake pi in tests |
| `authorize` | allow all | |
| `handlers` | `{ directMessage: true, mention: true, subscribed: false }` | `subscribed` handles follow-ups in threads you `thread.subscribe()` |
| `showToolCalls` / `showToolResults` | `false` | `true` or a formatter |
| `idleTimeoutMs` | 30 min | `0` never disposes |
| `maxConcurrentTurns` | unlimited | Excess turns wait; `busyMessage` is posted while waiting |
| `emptyResponseMessage` | `(no response)` | |
| `formatError` | `Error: <message>` | |
| `onTurnEnd` | none | Receives every pi event of the turn; hook tracing here |
| `logger` | none | Any object with `info`/`warn`/`error`/`debug` |

`createDefaultSessionFactory({ sessionOptions })` forwards `model`, `thinkingLevel`, `tools`, `customTools` and friends to pi's `createAgentSession`.

## Alternatives

Other ways to talk to pi from a chat app, as of September 2026. Corrections welcome.

| Project | Runs as | One session per | Platforms |
| --- | --- | --- | --- |
| **pi-chat-sdk** | standalone process on pi's SDK | thread | anything Chat SDK supports |
| [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat) | pi extension + tmux workers, each channel in a Gondolin micro-VM | channel | Discord, Telegram |
| [tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge) | pi extension inside the TUI process | the TUI's own session (shared) | Telegram, WhatsApp, Slack, Discord |
| [comsysto/pi-slack-bridge](https://github.com/comsysto/pi-slack-bridge) | pi extension + tmux | DM thread | Slack |
| [samfoy/pi-slack-bot](https://github.com/samfoy/pi-slack-bot) | standalone process on pi's SDK | thread (DMs only) | Slack |
| [Crokily/pi-tag](https://github.com/Crokily/pi-tag) | standalone, `pi -p` per message | channel or DM | Slack |
| [geminixiang/mikan](https://github.com/geminixiang/mikan) | its own harness on `pi-agent-core` | thread, with a sandboxed workspace per channel | Slack |

Pick pi-chat, or an extension, if you want the bot to be the TUI session you are already sitting in, or if you want the per-channel VM sandbox pi-chat ships. Pick pi-chat-sdk if you want a resident bot that behaves like `pi` in a directory, with the chat platform swapped in for the terminal.

## Things that bit us

- **Call `bot.initialize()` yourself** when running as a socket-mode or polling daemon. Chat SDK only auto-initializes on the first webhook.
- **`concurrency` defaults to `"drop"`.** A second message during a turn is discarded. `"queue"` keeps it, but queued entries expire after `queueEntryTtlMs` (90 s by default), which a slow model overruns easily. Prefer `"concurrent"`: `attachPi` already runs one turn per thread at a time and `maxConcurrentTurns` caps the total, with no expiry.
- **Slack edits are rate limited.** Fallback streaming edits the message every `streamingUpdateIntervalMs` (500 ms by default). Raise it to around 1500 ms for Slack, or enable `nativeStreaming` on the adapter (needs the `assistant:write` scope).
- **Memory state loses subscriptions on restart.** Fine for DMs and mentions, which do not need subscriptions. Use a persistent state adapter if you rely on `onSubscribedMessage`.
- **Slack DMs are one long thread.** Chat SDK maps every top-level DM message to the same thread id, so a DM channel is one pi session. Replies inside a Slack thread get their own session. With the Agent experience (`agentView: true`) every Slack session is its own thread instead.
- **Extensions need `bindExtensions`.** pi's `createAgentSession` does not bind extensions on its own. The default factory does it with no UI, so extension calls to `ctx.ui.confirm()` resolve `false` and `select`/`input` resolve `undefined`. Configure extensions that prompt for approval (for example `approveTools: false` in pi-mcp-adapter) accordingly.
- **Context files depend on `cwd`.** pi reads `AGENTS.md` (or `CLAUDE.md`) from `cwd` and its parents in addition to `~/.pi/agent/AGENTS.md`. Choose `cwd` deliberately.

## Testing your bot

`@chat-adapter/tests` provides a mock adapter and matchers. Pass `createSession` to fake pi:

```ts
import { Chat } from "chat";
import { createMockAdapter, createMockState, createTestMessage } from "@chat-adapter/tests";
import { attachPi, type PiSession } from "pi-chat-sdk";

const adapter = createMockAdapter("mock", { isDM: () => true });
const bot = new Chat({ userName: "pi", adapters: { mock: adapter }, state: createMockState() });
attachPi(bot, { cwd: "/tmp", createSession: async () => fakePiSession /* implements PiSession */ });
await bot.processMessage(adapter, "mock:D1:", createTestMessage("m1", "hi", { threadId: "mock:D1:" }));
expect(adapter).toHaveStartedTyping("mock:D1:");
```

See `test/helpers.ts` in this repo for a complete fake session.

## Development

```bash
npm ci
npm test
npm run typecheck
```

`.npmrc` sets `legacy-peer-deps=true`; npm's resolver trips over Chat SDK's vitest peer range otherwise.

### Releasing

Releases use npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (GitHub Actions OIDC, no token secret) with [staged publishing](https://docs.npmjs.com/staged-publishing/): CI can only stage, a maintainer approves with 2FA. Add an entry to `CHANGELOG.md`, bump `version` in `package.json`, commit, then push a matching tag:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

`release.yml` checks that the tag matches `package.json`, runs typecheck, tests and build, and runs `npm stage publish`. Then review and approve on a machine logged in to npm:

```bash
npm stage list pi-chat-sdk
npm stage view <stage-id>
npm stage approve <stage-id>   # asks for a 2FA code
```

Finally publish a GitHub Release for the tag with the changelog entry as its notes.

## License

MIT
