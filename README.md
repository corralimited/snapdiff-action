# SnapDiff Visual Test Action

Run visual regression tests with [SnapDiff](https://snapdiff.ai) from your GitHub Actions workflow. Auto-discovers your preview URL from GitHub deployment statuses (Vercel, Netlify, Cloudflare Pages, anything that writes deployments), captures every page you list, and posts the result as a PR commit status.

```yaml
# .github/workflows/visual-test.yml
name: Visual Regression
on: pull_request

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: corralimited/snapdiff-action@v1
        with:
          api-key: ${{ secrets.SNAPDIFF_API_KEY }}
          project: my-site
          pages: |
            homepage=/
            pricing=/pricing
            dashboard=/dashboard
```

That's it. No `VERCEL_TOKEN`, no `vercel/preview-url` polling step, no Playwright config to write.

## Setup

1. Sign up at [snapdiff.ai/signup](https://snapdiff.ai/signup) and grab an API key.
2. Create a project in the dashboard (or via API). Note the **slug** — you'll reference it in `project:` below.
3. Add `SNAPDIFF_API_KEY` to your repository secrets at **Settings → Secrets and variables → Actions**.
4. Drop the workflow above into `.github/workflows/visual-test.yml`.

The first PR creates baselines; subsequent PRs diff against them.

## How the preview URL is discovered

The action reads GitHub's [deployments API](https://docs.github.com/en/rest/deployments) for the PR's commit, finds the most recent deployment whose environment matches `preview` (case-insensitive) and whose status is `success`, and uses its `environment_url` as the base for any path-style `pages:` entries.

This means Vercel, Netlify, Cloudflare Pages, and Render all work out of the box — they all write `deployment` events to GitHub on every preview build.

If your host doesn't write deployments, pass `preview-url:` explicitly:

```yaml
- uses: corralimited/snapdiff-action@v1
  with:
    api-key: ${{ secrets.SNAPDIFF_API_KEY }}
    project: my-site
    preview-url: https://staging.myapp.com
    pages: |
      homepage=/
      pricing=/pricing
```

Or use absolute URLs in `pages:` directly (skips discovery for those pages):

```yaml
pages: |
  homepage=https://staging.myapp.com/
  external=https://other-host.com/page
```

## Authentication on protected previews

If your preview is behind Vercel Deployment Protection, Cloudflare Access, basic auth, or any header-based bypass, drop the headers into `extra-headers:`:

```yaml
- uses: corralimited/snapdiff-action@v1
  with:
    api-key: ${{ secrets.SNAPDIFF_API_KEY }}
    project: my-site
    extra-headers: |
      x-vercel-protection-bypass: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
      x-vercel-set-bypass-cookie: true
    pages: |
      homepage=/
```

Cloudflare Access uses the same pattern with `CF-Access-Client-Id` / `CF-Access-Client-Secret`. Header values are sent on every page capture and **not** persisted in SnapDiff's database.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | yes | — | Your SnapDiff API key (`sd_live_xxx`). Store in GitHub Secrets. |
| `project` | yes | — | Project slug or ID |
| `pages` | yes | — | Pages to test, one per line in `name=path` or `name=url` format |
| `api-url` | no | `https://api.snapdiff.ai` | API base URL (override for self-hosted) |
| `preview-url` | no | — | Skip auto-discovery and use this base URL |
| `preview-environment` | no | `preview` on PRs, `production` otherwise | Filter GH deployment environment by substring (case-insensitive) |
| `preview-timeout` | no | `10` | Max minutes to wait for a matching `success` deployment |
| `extra-headers` | no | — | Headers applied to every capture, one per line as `Key: value` |
| `viewport-width` | no | `1280` | Viewport width in CSS pixels |
| `viewport-height` | no | `720` | Viewport height in CSS pixels |
| `full-page` | no | `false` | Capture the entire scrollable page (vs. viewport only) |
| `wait` | no | `true` | Wait for the build to finish diffing and report results |
| `wait-timeout` | no | `5` | Max minutes to wait for build completion |
| `github-token` | no | `${{ github.token }}` | Token used to read deployment statuses |

## Outputs

| Output | Description |
|---|---|
| `build-id` | The SnapDiff build ID |
| `status` | Final build status (`approved`, `changes_requested`, `failed`) |
| `changed-count` | Number of pages with visual changes |
| `review-url` | URL to review the build in the SnapDiff dashboard |
| `preview-url` | The base URL that was discovered (or the explicit `preview-url` input) |

## What happens, end to end

1. The action waits for a `success` deployment matching `preview-environment` on the PR's commit SHA.
2. Captures every page in `pages:` using a Chromium browser running on the CI runner — fonts pinned, color profile sRGB, scrollbars hidden, network idled with a 5s cap.
3. Uploads each PNG to `POST /v1/screenshot/upload` and collects the returned `screenshot_id`s.
4. Creates a build via `POST /v1/projects/<project>/builds` referencing the screenshot IDs.
5. Polls the build until SnapDiff finishes diffing.
6. **No baselines exist yet (first run)**: all pages are auto-approved, baselines created.
7. **Baselines exist + pages unchanged**: ✅ commit status `snapdiff/visual-test` → success.
8. **Baselines exist + pages changed**: 🟡 commit status `snapdiff/visual-test` → pending. The workflow stays green; merge is blocked via the pending status until a reviewer approves at `review-url`.
9. **Approving in the dashboard** updates the commit status to success and unblocks the merge.

## Merge gating

The workflow itself stays green regardless of visual changes — gating is done separately by the `snapdiff/visual-test` commit status. Add it as a required check under **Settings → Branches → Branch protection rules**.

To enable status posting, connect a GitHub PAT under **Integrations** in the SnapDiff dashboard. The token requires the `repo:status` scope.

## When to use a different tool

This action is the right fit for diffing **public pages** on every PR. If you need something different:

- **[`@corralimited/snapdiff-playwright`](https://www.npmjs.com/package/@corralimited/snapdiff-playwright)** — write Playwright tests yourself. Required for routes behind a login wall, and the better fit for Storybook (loop over `index.json`).
- **[`@corralimited/snapdiff-cli`](https://www.npmjs.com/package/@corralimited/snapdiff-cli)** — one-off `snapdiff diff` and `snapdiff diff-baseline` calls. Useful for shell scripts and local checks; SnapDiff captures the URL server-side.

## Troubleshooting

**`No 'preview' deployment with state=success found`** — Your host isn't writing GitHub deployments, or it's deployed but the environment name doesn't match. Pass `preview-environment:` with whatever substring matches your env (`staging`, your Vercel project alias, etc.), or `preview-url:` to skip discovery.

**`Could not start chromium`** — Workflow runner ran out of disk. Add `- run: df -h` before the action step to confirm; usually a sibling step is leaving a fat install around.

**Workflow times out waiting for build** — Bump `wait-timeout:` (default 5 min). Large builds — Storybook-style, 100+ pages — can take longer. Or set `wait: false` to fire and forget; the `snapdiff/visual-test` commit status will update asynchronously.

**Every page reports "changed" on the first run** — Expected. First run on a new branch establishes baselines; second run diffs against them.

**Headers in `extra-headers:` aren't being applied** — Each line must be a literal `Key: value` (no quotes, no trailing commas). Lines without a colon are silently dropped.

## License

MIT — see [LICENSE](./LICENSE).
