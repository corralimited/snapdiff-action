# SnapDiff GitHub Action

URL-based visual regression testing for deployed sites. Captures pages, compares them against baselines, and gates merges through a `snapdiff/visual-test` commit status.

Use this action for public routes. For routes behind authentication, pair it with [`@corralimited/snapdiff-playwright`](https://www.npmjs.com/package/@corralimited/snapdiff-playwright). Both write to the same SnapDiff project, so baselines and reviews stay unified.

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

The action discovers the preview URL from GitHub deployment statuses written by your host (Vercel, Netlify, Cloudflare Pages, AWS Amplify, Render, and others).

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `api-key` | yes | — | SnapDiff API key (`sd_live_xxx` or `sd_test_xxx`) |
| `project` | yes | — | SnapDiff project slug or ID |
| `pages` | yes | — | Pages to test, one per line in `name=path` or `name=url` format |
| `api-url` | no | `https://api.snapdiff.dev` | Override for self-hosted SnapDiff |
| `preview-url` | no | auto | Skip discovery and use this base URL |
| `preview-environment` | no | `preview` on PR, `production` on push | Substring filter for the GitHub deployment environment name |
| `preview-timeout` | no | `10` | Maximum minutes to wait for the deployment |
| `extra-headers` | no | — | HTTP headers applied to every page capture, one per line as `Key: value`. See [Authentication on protected previews](#authentication-on-protected-previews). |
| `github-token` | no | `${{ github.token }}` | Token used to read deployment statuses |
| `wait` | no | `true` | Poll the build to completion before exiting |
| `wait-timeout` | no | `5` | Maximum minutes to wait for the build |

## Pages input

Each line is `name=path` or `name=url`:

```
homepage=/
pricing=/pricing
docs=/docs
external=https://other-host.com/page
```

Paths beginning with `/` are resolved against the discovered preview or production URL. Full URLs are used as supplied. When every entry is a full URL, the action skips discovery, which is useful for hosts that do not publish GitHub deployments such as GitHub Pages or sites deployed over FTP.

## Outputs

| Name | Description |
| --- | --- |
| `build-id` | The SnapDiff build ID |
| `status` | `approved`, `changes_requested`, or `failed` |
| `changed-count` | Number of pages with visual changes |
| `review-url` | Dashboard URL for reviewing the build |
| `preview-url` | Discovered base URL, or the explicit override |

## Authentication on protected previews

Hosts like Vercel, Cloudflare Access, and AWS Amplify can lock down preview deployments behind authentication. SnapDiff's headless browser will hit the login wall instead of your page unless you give it a way through. Use `extra-headers` to pass a bypass token.

### Vercel Deployment Protection

Vercel has a first-party feature for this called **Protection Bypass for Automation**.

1. **Vercel project → Settings → Deployment Protection** → enable **Protection Bypass for Automation** → generate a secret.
2. Add the secret to your GitHub repo secrets as `VERCEL_BYPASS_SECRET`.
3. Pass it via `extra-headers`:

   ```yaml
   - uses: corralimited/snapdiff-action@v1
     with:
       api-key: ${{ secrets.SNAPDIFF_API_KEY }}
       project: my-project
       pages: |
         home=/
         pricing=/pricing
       extra-headers: |
         x-vercel-protection-bypass: ${{ secrets.VERCEL_BYPASS_SECRET }}
         x-vercel-set-bypass-cookie: true
   ```

The header sets a session cookie on first hit, so subsequent assets (CSS, fonts, images) load without re-authenticating — important for full-page captures. Header values are not stored in the SnapDiff database.

Reference: [Vercel Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

### Cloudflare Access

Use a service token. In the Cloudflare dashboard create a service token, then pass the resulting `CF-Access-Client-Id` and `CF-Access-Client-Secret`:

```yaml
extra-headers: |
  CF-Access-Client-Id: ${{ secrets.CF_ACCESS_CLIENT_ID }}
  CF-Access-Client-Secret: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
```

### Basic auth, custom tokens, IP allowlist headers

Any host that accepts a static header for authentication works the same way — drop the header into `extra-headers`.

## Merge gating

When visual changes are detected, the workflow does not fail. Instead, SnapDiff posts a separate commit status named `snapdiff/visual-test` through the GitHub API:

- **pending** — the build is processing, or changes are awaiting review
- **success** — no changes detected, or all changes have been approved in the dashboard
- **error** — the build failed for reasons unrelated to visual differences

Add `snapdiff/visual-test` as a required check in your branch protection rules. While the status is pending, the merge button is blocked. A reviewer opens the dashboard to approve changes (which become the new baseline) or reject them. Once approved, the status updates to success and the merge is unblocked.

To enable status posting, connect a GitHub repository and personal access token under Integrations in the SnapDiff dashboard. The token requires the `repo:status` scope.

## Auto-discovery support

Auto-discovery relies on the GitHub Deployments API, which is populated by most modern hosts:

| Host | Supported | Notes |
| --- | --- | --- |
| Vercel | yes | Push and pull request |
| Netlify | yes | Push and pull request |
| Cloudflare Pages | yes | Push and pull request |
| AWS Amplify | yes | Push and pull request |
| Render | yes | Push and pull request |
| GitHub Pages | no | No pull request previews. Use full URLs in `pages`. |
| FTP / custom | varies | Use full URLs, or set `preview-url` explicitly |

If your host does not publish GitHub deployments, provide a static `preview-url` or use full URLs in the `pages` input.

## License

MIT
