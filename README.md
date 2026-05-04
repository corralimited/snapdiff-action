# SnapDiff GitHub Action

URL-based visual regression testing for any deployed site. Captures pages, diffs against baselines, gates merges via a `snapdiff/visual-test` commit status.

> Pairs with [`@corralimited/snapdiff-playwright`](https://www.npmjs.com/package/@corralimited/snapdiff-playwright) — use the action for unauthenticated routes (marketing sites, docs, public dashboards) and the Playwright reporter for routes behind a login. Both modes write to the same SnapDiff project, so you get one set of baselines and one review UI no matter where each page comes from.

## Quickstart

```yaml
# .github/workflows/visual.yml
name: Visual diff

on:
  pull_request:
  push:
    branches: [main]

jobs:
  visual:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
      - uses: corralimited/snapdiff-action@v1
        with:
          api-key: ${{ secrets.SNAPDIFF_API_KEY }}
          project: my-project-slug
          pages: |
            homepage=/
            pricing=/pricing
            about=/about
```

That's the entire setup. The action auto-discovers the preview URL from your host's GitHub deployment statuses (Vercel, Netlify, Cloudflare Pages, AWS Amplify — anything that writes them).

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `api-key` | yes | — | SnapDiff API key (`sd_live_xxx` or `sd_test_xxx`) |
| `project` | yes | — | SnapDiff project slug or id |
| `pages` | yes | — | Pages to test, one per line in `name=path` or `name=url` format |
| `api-url` | no | `https://api.snapdiff.dev` | Override for self-hosted SnapDiff |
| `preview-url` | no | (auto) | Skip auto-discovery and use this base URL |
| `preview-environment` | no | `preview` on PR, `production` on push | Substring filter for matching the GitHub deployment environment name |
| `preview-timeout` | no | `10` | Max minutes to wait for the deployment to become available |
| `github-token` | no | `${{ github.token }}` | Token for reading deployment statuses |
| `wait` | no | `true` | Poll the build to completion before exiting |
| `wait-timeout` | no | `5` | Max minutes to wait for the build |

## Pages input

Each line is `name=path` or `name=url`:

```
homepage=/
pricing=/pricing
docs=/docs
external=https://other-host.com/page
```

- Paths (starting with `/`) are resolved against the auto-discovered preview/production URL.
- Full URLs are used as-is.
- If every page is a full URL, auto-discovery is skipped — useful for hosts that don't write GitHub deployments (GitHub Pages, FTP-deployed sites, etc.).

## Outputs

| Name | Description |
| --- | --- |
| `build-id` | The SnapDiff build ID |
| `status` | `approved`, `changes_requested`, or `failed` |
| `changed-count` | Number of pages with visual changes |
| `review-url` | Dashboard URL for reviewing the build |
| `preview-url` | The base URL discovered (or the explicit override) |

## How the merge gate actually works

When visual changes are detected, **the workflow itself does not fail** — it stays green. SnapDiff posts a separate commit status named `snapdiff/visual-test` directly via the GitHub API. That status's lifecycle:

- 🟡 **pending** — build is processing, or changes detected and awaiting review
- ✅ **success** — no changes, or all changes accepted in the dashboard
- ❌ **error** — build failed (real error, not a visual regression)

In your repo's branch protection rules, **require the `snapdiff/visual-test` status** to pass. Pending = merge button greyed out. The reviewer opens the dashboard, accepts (becomes a new baseline) or rejects (must fix the code). On accept, the status flips to ✅ and merge unblocks.

This mirrors how Chromatic and Argos work — visual changes are a "needs review" gate, not a "failure".

To enable: in the SnapDiff dashboard for your project, add a GitHub repo + PAT under integrations. The PAT needs `repo:status` scope on the repo you want SnapDiff to post to.

## Auto-discovery requirements

Auto-discovery uses GitHub's Deployments API, which most modern hosts populate automatically:

| Host | Auto-discovery | Notes |
| --- | --- | --- |
| Vercel | ✅ | Both push and PR |
| Netlify | ✅ | Both push and PR |
| Cloudflare Pages | ✅ | Both push and PR |
| AWS Amplify | ✅ | Both push and PR |
| Render | ✅ | Both push and PR |
| GitHub Pages | ❌ | No PR previews. Use full URLs in `pages` to skip discovery. |
| FTP / custom | varies | Use full URLs or set `preview-url` |

If your host doesn't write GitHub deployments, supply a static `preview-url` or use full URLs in `pages` — the action will skip discovery and use them as-is.

## License

MIT
