import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:28474/?qa=1';
const cases = [
  { name: 'chromium', type: chromium, options: { channel: 'chromium', headless: true } },
  { name: 'firefox', type: firefox, options: { headless: true } },
  { name: 'webkit', type: webkit, options: { headless: true } },
];
const results = [];

for (const item of cases) {
  const result = { browser: item.name, version: '', ok: false, errors: [] };
  let browser;
  try {
    browser = await item.type.launch(item.options);
    result.version = browser.version();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(process.env.CI ? 120_000 : 60_000);
    page.on('pageerror', (error) => result.errors.push(`page: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') result.errors.push(`console: ${message.text()} @ ${message.location().url}`);
    });
    await page.goto(baseURL);
    await page.waitForSelector('canvas', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.__THREE_GAME_DIAGNOSTICS__?.state));
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state.loadedModels.length === 7);
    const showroomBefore = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.yaw);
    const canvasBox = await page.locator('.game-canvas canvas').boundingBox();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.76, canvasBox.y + canvasBox.height * 0.52);
    await page.mouse.down();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging);
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.86, canvasBox.y + canvasBox.height * 0.57, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction((yaw) => window.__THREE_GAME_DIAGNOSTICS__.showroom.yaw !== yaw, showroomBefore);
    await page.getByRole('button', { name: '选择星辉号' }).click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state.selectedKart === 'nova');
    result.showroom = await page.evaluate(() => ({ ...window.__THREE_GAME_DIAGNOSTICS__.showroom }));
    await page.getByRole('button', { name: '开始比赛' }).click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state.phase === 'racing', { timeout: process.env.CI ? 60_000 : 15_000 });
    await page.waitForFunction(() => Boolean(window.__THREE_GAME_DIAGNOSTICS__.state.question));
    const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.playerDistance);
    await page.waitForTimeout(900);
    const correctIndex = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.question.correctIndex);
    await page.locator('.answer-button').nth(correctIndex).click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.state.correctCount === 1);
    result.diagnostics = await page.evaluate(() => {
      const diagnostics = window.__THREE_GAME_DIAGNOSTICS__;
      const canvas = document.querySelector('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        phase: diagnostics.state.phase,
        autoOnly: diagnostics.state.autoOnly,
        correctCount: diagnostics.state.correctCount,
        distance: diagnostics.state.playerDistance,
        loadedModels: diagnostics.state.loadedModels,
        loadedLandmarks: diagnostics.state.loadedLandmarks,
        fps: diagnostics.state.fps,
        calls: diagnostics.renderer.render.calls,
        triangles: diagnostics.renderer.render.triangles,
        geometries: diagnostics.renderer.memory.geometries,
        textures: diagnostics.renderer.memory.textures,
        gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      };
    });
    result.distanceTravelled = result.diagnostics.distance - before;
    result.ok = result.distanceTravelled > 1 && result.diagnostics.correctCount === 1 && result.diagnostics.autoOnly && result.showroom?.selectedKart === 'nova' && result.showroom?.visibleKarts === 1 && result.errors.length === 0;
    await page.close();
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await browser?.close();
  }
  results.push(result);
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${item.name} ${result.version} ${result.errors.join('; ')}`);
}

const reportPath = process.env.REPORT_PATH ?? 'artifacts/browser-compatibility-v5.json';
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({ results }, null, 2)}\n`);
if (results.some((result) => !result.ok)) process.exitCode = 1;
