# pi-chat-sdk

Glue between [pi](https://pi.dev) (the minimal coding agent) and [Chat SDK](https://chat-sdk.dev). One Chat SDK thread becomes one persistent pi session; pi's streamed output becomes a streamed chat message. Slack, Teams, Discord, Google Chat and the other Chat SDK adapters all work the same way.

The package deliberately stops there. Persona, tool policy, MCP servers, sandboxing, models and deployment stay in your bot and your `~/.pi/agent` config, exactly as they would for the pi TUI.

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

## What it does

- **Thread = session.** Session files live in pi's own per-cwd directory (`~/.pi/agent/sessions/--<cwd>--/chat-<thread id>.jsonl`), so `pi --resume` in that cwd can open a chat conversation in the TUI.
- **Streaming.** Text deltas are pushed as they arrive. Adapters with native streaming use it; others get post-and-edit from Chat SDK.
- **Tool calls.** Hidden by default. `showToolCalls: true` renders a one-line summary per call as its own paragraph; pass a function for custom formatting or to skip some tools.
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

## Things that bit us

- **Call `bot.initialize()` yourself** when running as a socket-mode daemon. Chat SDK only auto-initializes on the first webhook.
- **`concurrency` defaults to `"drop"`.** A second message during a turn is discarded. `"queue"` keeps it, but queued entries expire after `queueEntryTtlMs` (90 s by default), which a slow model overruns easily. Prefer `"concurrent"`: `attachPi` already runs one turn per thread at a time and `maxConcurrentTurns` caps the total, with no expiry.
- **Slack edits are rate limited.** Fallback streaming edits the message every `streamingUpdateIntervalMs` (500 ms by default). Raise it to around 1500 ms for Slack, or enable `nativeStreaming` on the adapter (needs the `assistant:write` scope).
- **Memory state loses subscriptions on restart.** Fine for DMs and mentions, which do not need subscriptions. Use a persistent state adapter if you rely on `onSubscribedMessage`.
- **Slack DMs are one long thread.** Chat SDK maps every top-level DM message to the same thread id, so a DM channel is one pi session. Replies inside a Slack thread get their own session.
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

Releases use npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (GitHub Actions OIDC, no token secret) with [staged publishing](https://docs.npmjs.com/staged-publishing/): CI can only stage, a maintainer approves with 2FA. Bump `version` in `package.json`, commit, then push a matching tag:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

`release.yml` checks that the tag matches `package.json`, runs typecheck, tests and build, and runs `npm stage publish`. Then review and approve on a machine logged in to npm:

```bash
npm stage list pi-chat-sdk
npm stage view <stage-id>
npm stage approve <stage-id>   # asks for a 2FA code
```

## License

MIT
