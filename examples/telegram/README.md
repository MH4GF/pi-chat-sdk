# pi on Telegram

The quickest way to see pi-chat-sdk work: Telegram bots can long-poll, so there is no
public URL, manifest or app review. One token from [@BotFather](https://t.me/BotFather).

```bash
cp .env.example .env      # paste the token
npm install
node --env-file=.env index.ts
```

Then message your bot. A private chat is one pi session; in groups, mention the bot and
each reply chain is a session. Sessions land in `~/.pi/agent/sessions/` for the `PI_CWD`
you chose, so `pi --resume` in that directory opens them in the TUI.

Set `TELEGRAM_ALLOWED_USER_IDS` before exposing the bot to anyone else: pi runs with the
tools and model configured in `~/.pi/agent`, on your machine.
