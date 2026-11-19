import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:28474/?qa=1';
const output = process.env.OUTPUT_DIR ?? 'artifacts/v8-audit/drivers-before';
const karts = [
  ['comet', '选择彗星号'], ['reef', '选择浪花号'], ['bolt', '选择闪电号'],
  ['sprout', '选择嫩芽号'], ['nova', '选择星辉号'], ['titan', '选择巨石号'], ['mochi', '选择麻薯号'],
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const records = [];
try {
  for (const [id, buttonName] of karts) {
    await page.goto(baseURL);
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
    await page.getByRole('button', { name: buttonName }).click();
    await page.mouse.move(900, 420);
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/${id}-menu.png` });
    await page.mouse.move(900, 420);
    await page.mouse.down();
    await page.mouse.move(700, 420, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/${id}-side.png` });
    await page.evaluate(async () => {
      await window.__THREE_GAME_TEST_HOOKS__.setState('active-play');
      window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${output}/${id}-race.png` });
    records.push({ id, showroom: await page.evaluate(() => ({ ...window.__THREE_GAME_DIAGNOSTICS__.showroom })) });
  }
  await writeFile(`${output}/report.json`, `${JSON.stringify({ ok: errors.length === 0, count: records.length, records, errors }, null, 2)}\n`);
  console.log(`PASS: ${records.length} karts captured in ${output}`);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
