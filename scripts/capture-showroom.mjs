import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:28474/?qa=1';
const output = process.env.OUTPUT_DIR ?? 'artifacts/v4.1-showroom-karts';
const karts = [
  ['comet', '选择彗星号'],
  ['reef', '选择浪花号'],
  ['bolt', '选择闪电号'],
  ['sprout', '选择嫩芽号'],
  ['nova', '选择星辉号'],
  ['titan', '选择巨石号'],
  ['mochi', '选择麻薯号'],
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(baseURL);
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(true));
const captures = [];
for (const [id, buttonName] of karts) {
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForFunction((kartId) => window.__THREE_GAME_DIAGNOSTICS__.state.selectedKart === kartId, id);
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${output}/${id}.png` });
  captures.push(await page.evaluate(() => ({ ...window.__THREE_GAME_DIAGNOSTICS__.showroom })));
  if (process.env.CAPTURE_SIDES === '1') {
    await page.mouse.move(760, 480);
    await page.mouse.down();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging);
    await page.mouse.move(1110, 480, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    await page.screenshot({ path: `${output}/${id}-side.png` });
  }
}
await page.getByRole('button', { name: '选择彗星号' }).click();
await page.mouse.move(760, 480);
await page.mouse.down();
await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging);
await page.mouse.move(1153, 480, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);
await page.screenshot({ path: `${output}/comet-back.png` });
const backView = await page.evaluate(() => ({ ...window.__THREE_GAME_DIAGNOSTICS__.showroom }));
await writeFile(`${output}/report.json`, `${JSON.stringify({ ok: errors.length === 0 && captures.every((capture) => capture.visibleKarts === 1), captures, backView, errors }, null, 2)}\n`);
await browser.close();
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${karts.length} showroom karts + dragged back view captured in ${output}`);
}
