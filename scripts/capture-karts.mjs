import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const karts = [
  ['comet', 'P1 选择彗星号'],
  ['bolt', 'P1 选择闪电号'],
  ['sprout', 'P1 选择嫩芽号'],
  ['nova', 'P1 选择星辉号'],
  ['reef', 'P1 选择浪花号'],
  ['titan', 'P1 选择巨石号'],
  ['mochi', 'P1 选择麻薯号'],
];
await mkdir('artifacts/hero-assets-1', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:28473');
await page.waitForSelector('canvas', { state: 'visible' });
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
for (const [index, [id, buttonName]] of karts.entries()) {
  if (index > 0) {
    await page.reload();
    await page.waitForSelector('canvas', { state: 'visible' });
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
  }
  await page.getByRole('button', { name: buttonName }).click();
  await page.evaluate(async () => {
    await window.__THREE_GAME_TEST_HOOKS__.setState('active-play');
    window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `artifacts/hero-assets-1/${id}.png` });
}
const diagnostics = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.assets);
await writeFile('artifacts/hero-assets-1/assets.json', `${JSON.stringify({ diagnostics, errors }, null, 2)}\n`);
await browser.close();
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
