# Examples

Each directory is a standalone bot: one `index.ts`, a `package.json` and an `.env.example`.
Copy one into your own project as a starting point.

| Example | Transport | Status |
| --- | --- | --- |
| [slack](./slack) | Socket Mode, with manifests for the Agent experience and for a plain bot | Runs in production |
| [telegram](./telegram) | Long polling | Untested |
| [discord](./discord) | Gateway WebSocket | Untested |

All of them run with `node --env-file=.env index.ts` on Node 22.18+ (type stripping, no build
step) and need pi configured in `~/.pi/agent` (`pi` once in the TUI to pick a model). CI
typechecks every example against the package in this repo.
