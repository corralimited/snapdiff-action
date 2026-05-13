#!/usr/bin/env node
// Captures each `pages` URL in this CI runner via Playwright, uploads the
// PNGs to SnapDiff, and creates a build that references the returned
// screenshot_ids. Run by action.yml's "Capture & create build" step.
//
// Env inputs (set by action.yml):
//   SD_API_URL          SnapDiff API base (https://api.snapdiff.ai)
//   SD_API_KEY          sd_live_xxx
//   SD_PROJECT          project slug or ID
//   SD_PAGES_JSON       [{ name, url }, ...]
//   SD_HEADERS_JSON     { Header: value, ... } or empty
//   SD_VIEWPORT_WIDTH   int
//   SD_VIEWPORT_HEIGHT  int
//   SD_FULL_PAGE        'true' | 'false'
//   SD_BRANCH, SD_COMMIT_SHA, SD_COMMIT_MSG, SD_PR_URL — git metadata
//
// Writes to $GITHUB_OUTPUT:
//   build_id    bld_xxx
//   review_url  dashboard URL for the build

import { appendFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const env = process.env;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

const API_URL = (env.SD_API_URL || 'https://api.snapdiff.ai').replace(/\/$/, '');
const API_KEY = env.SD_API_KEY;
const PROJECT = env.SD_PROJECT;
const PAGES = JSON.parse(env.SD_PAGES_JSON || '[]');
const HEADERS = env.SD_HEADERS_JSON ? JSON.parse(env.SD_HEADERS_JSON) : {};
const VIEWPORT = {
  width: Number(env.SD_VIEWPORT_WIDTH) || 1280,
  height: Number(env.SD_VIEWPORT_HEIGHT) || 720,
};
const FULL_PAGE = env.SD_FULL_PAGE === 'true';

// Dashboard lives on the apex domain (https://snapdiff.ai/dashboard/...),
// not the api. subdomain. Strip the api. prefix; self-hosted setups serving
// both API and dashboard on one host (no api. prefix) fall through unchanged.
const DASHBOARD_URL = API_URL.replace(/^(https?:\/\/)api\./, '$1');

if (!API_KEY) fail('SD_API_KEY is required');
if (!PROJECT) fail('SD_PROJECT is required');
if (!PAGES.length) fail('SD_PAGES_JSON parsed to zero pages');

async function ghOutput(key, value) {
  if (!env.GITHUB_OUTPUT) return;
  await appendFile(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function capture(browser, { url }) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    extraHTTPHeaders: HEADERS,
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
    forcedColors: 'none',
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    // Cap network-idle wait so endless analytics / long-poll workloads don't
    // wedge the capture indefinitely.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    return await page.screenshot({ fullPage: FULL_PAGE, type: 'png' });
  } finally {
    await context.close();
  }
}

async function upload(buf, { name, url }) {
  const qs = new URLSearchParams({ source_url: url, label: name }).toString();
  const res = await fetch(`${API_URL}/v1/screenshot/upload?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-API-Key': API_KEY },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upload ${url} → ${res.status}: ${text}`);
  }
  const body = await res.json();
  return body.id;
}

async function createBuild(pages) {
  const body = {
    branch: env.SD_BRANCH || 'main',
    commit_sha: env.SD_COMMIT_SHA || '',
    pages: pages.map(({ name, screenshotId }) => ({
      name,
      screenshot_id: screenshotId,
    })),
  };
  if (env.SD_COMMIT_MSG) body.commit_message = env.SD_COMMIT_MSG;
  if (env.SD_PR_URL) body.pull_request_url = env.SD_PR_URL;

  const res = await fetch(`${API_URL}/v1/projects/${PROJECT}/builds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify(body),
  });
  if (res.status !== 202 && res.status !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`create build → ${res.status}: ${text}`);
  }
  return await res.json();
}

async function main() {
  console.log(`::group::Launching Chromium (viewport ${VIEWPORT.width}x${VIEWPORT.height}, full_page=${FULL_PAGE})`);
  const browser = await chromium.launch({
    headless: true,
    // Mirror the SnapDiff server's determinism flags so baselines captured
    // here diff cleanly against baselines captured anywhere else.
    args: [
      '--font-render-hinting=none',
      '--disable-font-subpixel-positioning',
      '--force-color-profile=srgb',
      '--disable-skia-runtime-opts',
      '--hide-scrollbars',
      '--no-sandbox',
    ],
  });
  console.log('::endgroup::');

  const captured = [];
  try {
    for (const page of PAGES) {
      console.log(`::group::Capturing ${page.name} → ${page.url}`);
      const buf = await capture(browser, page);
      const screenshotId = await upload(buf, page);
      console.log(`  ${page.name} → ${screenshotId} (${(buf.length / 1024).toFixed(1)} KiB)`);
      captured.push({ name: page.name, screenshotId });
      console.log('::endgroup::');
    }
  } finally {
    await browser.close();
  }

  console.log('::group::Creating build');
  const build = await createBuild(captured);
  console.log(`  build_id = ${build.id}`);
  console.log('::endgroup::');

  await ghOutput('build_id', build.id);
  await ghOutput('review_url', `${DASHBOARD_URL}/dashboard/builds/${build.id}`);

  console.log(`::notice::SnapDiff build created: ${build.id}`);
}

main().catch((err) => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
