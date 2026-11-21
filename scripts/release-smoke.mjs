import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:28474/';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(process.env.CI ? 120_000 : 60_000);
const errors = [];
const badResponses = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
await page.goto(baseURL);
await page.waitForSelector('canvas', { state: 'visible' });
const diagnosticsExposed = await page.evaluate(() => typeof window.__THREE_GAME_DIAGNOSTICS__ !== 'undefined' || typeof window.__THREE_GAME_TEST_HOOKS__ !== 'undefined');
await page.getByRole('button', { name: '开始比赛' }).click();
await page.waitForSelector('.race-hud', { state: 'visible' });
await page.locator('.math-panel[data-player-index="0"] [data-digit="1"]').waitFor({ state: 'visible', timeout: process.env.CI ? 60_000 : 10_000 });
const drivingControls = await page.getByRole('button', { name: /向左转|向右转|加速|刹车|漂移/ }).count();
await page.locator('.math-panel[data-player-index="0"] [data-digit="1"]').click();
await page.getByRole('button', { name: 'P1 确认答案' }).click();
const mathVisible = await page.locator('.math-panel').isVisible();
const report = {
  ok: !diagnosticsExposed && mathVisible && drivingControls === 0 && errors.length === 0 && badResponses.length === 0,
  url: baseURL,
  productionPlayerEntry: true,
  answerOnlyInput: true,
  diagnosticsExposed,
  mathVisible,
  drivingControls,
  errors,
  badResponses,
};
const reportPath = process.env.REPORT_PATH ?? 'artifacts/release-smoke-v5.json';
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.ok) process.exitCode = 1;
