// pi as a Slack bot over Socket Mode (no public URL). Run with `node index.ts`
// (Node 22.18+ strips types natively).
//
// env: SLACK_BOT_TOKEN (xoxb-), SLACK_APP_TOKEN (xapp-), SLACK_ALLOWED_USERS (comma-separated
// user IDs), optional SLACK_AGENT_VIEW=1 when the app manifest enables features.agent_view,
// optional PI_CWD
import { Chat, ConsoleLogger } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { attachPi } from "pi-chat-sdk";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// Slack rejects session titles containing markdown or mentions; strip them.
function sessionTitleFrom(text: string): string | null {
  const line = text.split("\n", 1)[0] ?? "";
  const title = line
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_~>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return title || null;
}

const logger = new ConsoleLogger("info", "pi-slack");
const allowedUsers = new Set(required("SLACK_ALLOWED_USERS").split(",").map((s) => s.trim()).filter(Boolean));
const agentView = process.env.SLACK_AGENT_VIEW === "1";

const bot = new Chat({
  userName: "pi",
  adapters: {
    slack: createSlackAdapter({
      mode: "socket",
      appToken: required("SLACK_APP_TOKEN"),
      botToken: required("SLACK_BOT_TOKEN"),
      // With manifest-agent-view.yaml: Slack's Agent experience. Each Slack session is a thread
      // with a title, and Chat SDK fires thread.signal (which aborts the pi turn) from the stop button.
      agentView,
      ...(agentView ? { sessionTitle: ({ text }: { text: string }) => sessionTitleFrom(text) } : {}),
      logger,
    }),
  },
  state: createMemoryState(),
  // attachPi serializes turns per thread; let Chat SDK run handlers concurrently.
  concurrency: { strategy: "concurrent" },
  // Only used when native streaming is unavailable (no assistant:write scope). Slack's
  // chat.update rate limit makes the 500 ms default fail.
  streamingUpdateIntervalMs: 1500,
  logger,
});

const attachment = attachPi(bot, {
  // pi reads AGENTS.md / CLAUDE.md, skills and .pi/ config from here.
  cwd: process.env.PI_CWD ?? process.cwd(),
  authorize: (message) => allowedUsers.has(message.author.userId),
  showToolCalls: true,
  logger,
});

// Socket Mode daemons must initialize explicitly; Chat SDK only auto-initializes on a webhook.
await bot.initialize();
logger.info("pi is listening on Slack", { agentView, allowedUsers: allowedUsers.size });

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void Promise.all([attachment.dispose(), bot.shutdown()]).finally(() => process.exit(0));
  });
}
