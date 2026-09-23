// pi as a Discord bot over the Gateway (WebSocket), so no public URL is needed. Run with
// `node index.ts` (Node 22.18+ strips types natively).
//
// Untested by the author. Chat SDK's Discord adapter drives the Gateway in fixed-length
// sessions meant for cron-driven serverless; this example loops them for a resident process.
//
// env: DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY, optional PI_CWD
import { Chat, ConsoleLogger } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { attachPi } from "pi-chat-sdk";

const logger = new ConsoleLogger("info", "pi-discord");

// Reads DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_PUBLIC_KEY from the environment.
const discord = createDiscordAdapter({ logger });

const bot = new Chat({
  userName: "pi",
  adapters: { discord },
  state: createMemoryState(),
  concurrency: { strategy: "concurrent" },
  streamingUpdateIntervalMs: 1500,
  logger,
});

const attachment = attachPi(bot, {
  cwd: process.env.PI_CWD ?? process.cwd(),
  showToolCalls: true,
  logger,
});

await bot.initialize();

// Leave "Interactions Endpoint URL" unset in the Discord app so interactions arrive on the
// Gateway too. Each listener runs for SESSION_MS, then reconnects.
const SESSION_MS = 60 * 60 * 1000;
const controller = new AbortController();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    controller.abort();
    void Promise.all([attachment.dispose(), bot.shutdown()]).finally(() => process.exit(0));
  });
}

logger.info("pi is listening on Discord");
while (!controller.signal.aborted) {
  let listener: Promise<unknown> = Promise.resolve();
  await discord.startGatewayListener({ waitUntil: (task) => { listener = task; } }, SESSION_MS, controller.signal);
  await listener;
}
