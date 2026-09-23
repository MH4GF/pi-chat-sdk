## Role

Weekly dependency maintenance. Consolidate the open Dependabot PRs into one PR from `origin/main`, following the Maintenance policy in `CLAUDE.md`.

## Procedure

1. List the open Dependabot PRs (`gh pr list --author app/dependabot`) and their CI results. The list at issue creation time is below, but re-read it; Dependabot may have rebased or closed some.
2. Decide per PR against the policy: accept, defer, or reject.
3. On a branch from `origin/main`, apply the accepted bumps with `npm install <pkg>@<version> --save-dev` (or `--save-exact` as the existing pins do) and the GitHub Actions bumps by editing the workflow files. Run the full verification from `CLAUDE.md`.
4. Update `README.md` / `examples/*/package.json` / `CHANGELOG.md` / `version` where the policy says so.
5. Put rejected bumps into `.github/dependabot.yml` `ignore` with a one-line reason.
6. Open one PR. Its body lists every Dependabot PR with the decision and reason. Dependabot closes its own PRs once main carries the new versions; do not merge or close them by hand.

## Done when

- One PR is open with green CI, or the issue explains why nothing could be done.
- Every Dependabot PR that was open has a decision recorded in the PR body.

## Open Dependabot PRs at issue creation
