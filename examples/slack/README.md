# pi on Slack

Socket Mode, so the bot runs anywhere with outbound internet: a laptop, a launchd or
systemd service, a container. This is the setup the author runs in production.

1. Create the app at [api.slack.com/apps](https://api.slack.com/apps) from a manifest.
   `manifest-agent-view.yaml` gives you Slack's Agent experience (agent panel, native
   streaming, stop button, session titles). `manifest.yaml` is a plain bot. The Agent
   experience cannot be switched back to `assistant_view` once enabled.
2. **Basic Information > App-Level Tokens**: generate one with `connections:write`. That is
   `SLACK_APP_TOKEN`.
3. **Install App** to your workspace. The Bot User OAuth Token is `SLACK_BOT_TOKEN`.
4. Put your Slack user ID in `SLACK_ALLOWED_USERS`. Everyone else is ignored.

```bash
cp .env.example .env
npm install
node --env-file=.env index.ts
```

DM the bot or mention it in a channel. With the Agent experience each Slack session is one
pi session. Without it, the DM channel is one long session and each thread you mention the
bot in is a session. Session files land in `~/.pi/agent/sessions/` for `PI_CWD`, so
`pi --resume` in that directory opens them in the TUI.

Adding scopes later requires reinstalling the app, which rotates the bot token.
