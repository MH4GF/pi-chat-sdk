// pi as a Telegram bot. Long polling, so no public URL is needed: a bot token from
// @BotFather is enough. Run with `node index.ts` (Node 22.18+ strips types natively).
//
// env: TELEGRAM_BOT_TOKEN, optional TELEGRAM_ALLOWED_USER_IDS (comma-separated), PI_CWD
import { Chat, ConsoleLogger } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { attachPi } from "pi-chat-sdk";

const logger = new ConsoleLogger("info", "pi-telegram");

const bot = new Chat({
  userName: process.env.TELEGRAM_BOT_USERNAME ?? "pi",
  adapters: {
    // Reads TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_IDS from the environment.
    // Polling mode starts in bot.initialize(); no webhook or secret token required.
    telegram: createTelegramAdapter({ mode: "polling", logger }),
  },
  state: createMemoryState(),
  // attachPi serializes turns per thread; let Chat SDK run handlers concurrently.
  concurrency: { strategy: "concurrent" },
  // Telegram has no native streaming outside private chats, so replies are post-and-edit.
  // The adapter enforces its own floor (1100 ms private, 3100 ms groups).
  streamingUpdateIntervalMs: 1500,
  logger,
});

const attachment = attachPi(bot, {
  // pi reads AGENTS.md / CLAUDE.md, skills and .pi/ config from here.
  cwd: process.env.PI_CWD ?? process.cwd(),
  showToolCalls: true,
  logger,
});

await bot.initialize();
logger.info("pi is listening on Telegram");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void Promise.all([attachment.dispose(), bot.shutdown()]).finally(() => process.exit(0));
  });
}
