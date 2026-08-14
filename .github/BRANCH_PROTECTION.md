# Blocking merges on a failing pipeline

The workflow in `workflows/ci.yml` reports a check, but a reported check does
not stop anything on its own. GitHub only refuses a merge when the check is
marked **required** on the target branch. That setting lives in the repository,
not in this file, so it has to be applied once after the repo exists.

The check to require is named **`verify`** (the job name in `ci.yml`). On a
pull request it renders as `CI / verify`.

## Option A: the `gh` CLI

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -F "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=verify" \
  -F "enforce_admins=true" \
  -F "required_pull_request_reviews=null" \
  -F "restrictions=null"
```

`strict=true` additionally requires the branch to be up to date with `main`
before merging, so a pull request cannot pass against a stale base and then
break `main` on landing.

`enforce_admins=true` applies the rule to administrators too. Drop it if you
want to keep the ability to merge past a red build yourself.

## Option B: the web UI

Settings, then Branches, then Add branch protection rule.

1. Branch name pattern: `main`
2. Tick **Require status checks to pass before merging**
3. Tick **Require branches to be up to date before merging**
4. In the search box, select **`verify`**. It only appears in that list after
   the workflow has run at least once, so push a branch first.
5. Optionally tick **Do not allow bypassing the above settings**, which is the
   UI equivalent of `enforce_admins`.

## Note on the Vercel side

Deployments for this project have so far gone out through direct
`vercel --prod` CLI runs, with deployment source `cli`, not through Vercel's
Git integration. Adding a GitHub remote does not by itself connect them. If
push-triggered deployments are wanted, the Git integration has to be connected
separately in the Vercel project settings, and that is a deliberate change to
how production ships rather than a side effect of adding CI.
