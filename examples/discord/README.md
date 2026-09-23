# pi on Discord

**Untested by the author.** The wiring follows Chat SDK's Discord adapter docs; please open
an issue with what you find.

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
   Copy the Application ID and Public Key from General Information.
2. **Bot**: reset the token, copy it, and enable the **Message Content Intent**.
3. Leave **Interactions Endpoint URL** empty so events come through the Gateway.
4. **OAuth2 > URL Generator**: scopes `bot` and `applications.commands`; permissions Send
   Messages, Send Messages in Threads, Create Public Threads, Read Message History. Open the
   URL to invite the bot.

```bash
cp .env.example .env
npm install
node --env-file=.env index.ts
```

Mention the bot in a channel. Each Discord thread is one pi session. Restrict who can talk to
it with `authorize` in `index.ts` before inviting it to a shared server.
