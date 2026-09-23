# Changelog

## 0.1.1 - 2026-09-23

- README: why, adapter status, alternatives, cancellation.
- `examples/`: runnable Slack (with app manifests for the Agent experience and a plain bot), Telegram (long polling) and Discord (Gateway) bots. CI typechecks them against the package in the repo.
- npm keywords and repository metadata.

No code changes.

## 0.1.0 - 2026-09-23

Initial release.

- `attachPi(bot, options)`: one Chat SDK thread = one pi session, streamed replies, tool-call summaries, per-thread serialization, `maxConcurrentTurns`, idle disposal, `authorize`, `formatError` / `emptyResponseMessage`.
- Sessions stored in pi's own per-cwd directory so `pi --resume` opens them in the TUI.
- `createDefaultSessionFactory` (`createAgentSession` + `bindExtensions` with no UI) and the `PiSession` interface for fakes.
- `runTurn` and the default tool-call / tool-result formatters exported for custom harnesses.
