# pi-chat-sdk

Glue between pi (`@earendil-works/pi-coding-agent`) sessions and Chat SDK (`chat`) threads. Public npm package, MIT. The README is the user-facing spec; keep it truthful before anything else.

## Layout

- `src/attach.ts` `attachPi`: per-thread session map, turn serialization, idle disposal
- `src/stream.ts` `runTurn`: pi events to a text stream, tool-call / tool-result lines
- `src/pi-session.ts` default session factory (`createAgentSession` + `bindExtensions`)
- `src/session-key.ts` thread id to session file name, default session dir
- `test/` vitest; `test/helpers.ts` has the fake `PiSession`. `test/pi-session.test.ts` starts a real pi session
- `examples/{slack,telegram,discord}` standalone bots, typechecked by CI against this checkout

## Verify

```bash
npm ci
npm run typecheck
npm test
npm run build
# examples, same as the CI job
for dir in examples/*/; do (cd "$dir" && npm pkg set dependencies.pi-chat-sdk=file:../.. && npm install --no-package-lock --no-audit --no-fund && npx tsc --noEmit && git checkout package.json); done
```

`.npmrc` sets `legacy-peer-deps=true` because npm's resolver trips over Chat SDK's vitest peer range. Node 22.19+ (see `engines`).

## Maintenance policy

Dependencies are updated by Dependabot PRs plus a weekly issue that asks a Symphony session to consolidate them (`.github/workflows/recurring-dependency-maintenance.yml`). Rules:

- **Cooldown**: `dependabot.yml` waits 7 days after a release (14 for majors) before proposing it, and `.npmrc` sets `min-release-age=7` for manual installs. Never bypass either (`--min-release-age 0`) to get a newer version. If a bump is urgent because of a vulnerability, Dependabot's security updates already skip the cooldown.
- **GitHub Actions bumps**: accept when CI is green. Actions are pinned to commit SHAs with a version comment; keep the comment in sync with the SHA.
- **`@types/node`**: its major tracks the lowest Node major in `engines` (22 today). Never bump it past that; it is in `dependabot.yml` `ignore`.
- **Dev tooling (typescript, vitest)**: accept when typecheck, tests and build pass and `dist/*.d.ts` are unchanged apart from formatting. vitest is constrained by `@chat-adapter/tests`' peer range; if a bump breaks that, leave it until the Chat SDK group moves and add an `ignore` entry with the reason.
- **`chat` / `@chat-adapter/*`** (the `chat-sdk` group): bump devDependencies, run everything, and check `peerDependencies.chat` still covers the new version. Also update the versions written in `README.md` and `examples/*/package.json`.
- **`@earendil-works/pi-coding-agent`** (the `pi` group): same, plus read pi's changelog for `createAgentSession`, `SessionManager` and `AgentSessionEvent` changes. `test/pi-session.test.ts` exercises the real SDK.
- **Version bump**: bump `version` (patch) and add a `CHANGELOG.md` entry when the published artifact changes: `src/`, `dist/`, `peerDependencies`, `engines`, `files`. Docs-only, examples-only, CI-only and devDependency-only changes do not bump.
- **Rejected bumps** go into `dependabot.yml` `ignore` with a comment; do not leave a Dependabot PR open as a way of saying no.
- **Releases are manual**: after merge a human tags `vX.Y.Z`, CI stages on npm, the human approves with 2FA and writes the GitHub Release (see README "Releasing"). Sessions never tag or publish.

## Conventions

- Keep the package small. Persona, tool policy, MCP, sandboxing and deployment belong to the bot that uses this package, not here.
- English in code, comments, docs and commit messages. Japanese is fine in WORKFLOW.md and issues.
- Do not claim an adapter works unless it was run. README marks Telegram and Discord as untested for that reason.
