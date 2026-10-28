# Keep web current with Pond

`main` mirrors Pond upstream. `web` carries Circé's browser transport, branding,
device connection and network adaptations. Updating `main` does not update `web`
or the running host.

## Sync an updated main

Start with a clean working tree on Node 24 and pnpm 11.27.0:

```sh
git fetch origin --prune
git switch web
git pull --ff-only origin web
git log --oneline web..origin/main
git merge --no-ff --no-commit origin/main
```

Resolve conflicts while retaining both upstream behavior and Circé's browser
adapters. Review new query names in `src/shared/web-capabilities.ts` under
`apps/desktop`: native paths and OS controls remain host-only. Check new events
against the browser adapter, and keep desktop-only controls out of visiting
browsers. Run the documented verification before committing:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm --filter @pond/desktop build:web
pnpm --filter @pond/extension build:circe
git diff --check
git commit -m "chore(circe): merge main into web"
git push origin web
```

Use the shared host for finite HTTP/browser smoke checks from the
[runbook](runbook.md#verification). Only its designated runtime owner may restart
it to load the rebuilt bundles. Keep the existing sandbox, origin configuration
and Tailscale gateway; a source update does not require certificate or DNS setup
again.

## Automate the repetitive work

The recommended next step is a bot-maintained sync PR targeting `web`. It would
merge the latest `origin/main` into a dedicated sync branch, run the existing
Circé check/build/browser workflow, and update the same PR when `main` advances.
Conflicts and new browser capabilities still require review. After merging, the
runtime owner rebuilds and activates the host separately.

This automation is not enabled. The repository's default branch is currently
`main`, and a workflow committed only to `web` does not receive pushes to `main`.
Choose an automation entrypoint before installing it: a small workflow on
`main`, or a scheduled/manual workflow after making `web` the default branch.
Keeping `main` an exact upstream mirror favors the second option.

GitHub Actions must be allowed to create PRs. When a workflow uses
`GITHUB_TOKEN` to create or update a PR, its checks require a user's approval;
a GitHub App token can start those checks automatically. See GitHub's
[workflow trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [repository permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).
