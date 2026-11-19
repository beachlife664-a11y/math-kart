import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const runId = process.env.RUN_ID || 'v3-preview';
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:28473/?qa=1';
const directory = `artifacts/${runId}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__, null, { timeout: 30000 });
const reports = [];
for (const state of ['active-play', 'harbor', 'cliff', 'cave', 'bridge', 'airborne']) {
  await page.evaluate(async (name) => {
    await window.__THREE_GAME_TEST_HOOKS__.setState(name);
    window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
  }, state);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${directory}/desktop-${state}.png` });
  const diagnostics = await page.evaluate(() => ({
    state: window.__THREE_GAME_DIAGNOSTICS__.state,
    render: { ...window.__THREE_GAME_DIAGNOSTICS__.renderer.render },
    memory: { ...window.__THREE_GAME_DIAGNOSTICS__.renderer.memory },
  }));
  reports.push({ state, ...diagnostics });
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
}
await writeFile(`${directory}/report.json`, JSON.stringify({ runId, errors, reports }, null, 2));
console.log(JSON.stringify({ runId, errors, renders: reports.map((report) => ({ state: report.state, render: report.render, assets: report.state.assets })) }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
