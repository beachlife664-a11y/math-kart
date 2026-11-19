import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ids = ['comet', 'reef', 'bolt', 'sprout', 'nova', 'titan', 'mochi'];
const output = path.resolve('artifacts/v7-ui/raw-thumbnails');
const evidence = path.resolve('artifacts/v7-ui');
await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 480, height: 360 }, deviceScaleFactor: 1 });
const records = [];
try {
  for (const id of ids) {
    const errors = [];
    const onPageError = (error) => errors.push(error.message);
    const onConsole = (message) => { if (message.type() === 'error') errors.push(message.text()); };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    const model = `/models/${id}.glb`;
    await page.goto(`http://127.0.0.1:28475/art-preview.html?model=${encodeURIComponent(model)}&view=thumb&transparent=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__previewDone === true, null, { timeout: 90000 });
    const stats = await page.evaluate(() => window.__previewStats);
    stats.errors.push(...errors);
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    if (stats.errors.length) throw new Error(`${id}: ${stats.errors.join('; ')}`);
    await page.screenshot({ path: path.join(output, `${id}.png`), omitBackground: true });
    records.push({ id, model, triangles: stats.triangles, meshes: stats.meshes, screenshot: `artifacts/v7-ui/raw-thumbnails/${id}.png`, errors: stats.errors });
  }
  await writeFile(path.join(evidence, 'thumbnail-report.json'), `${JSON.stringify({ ok: true, count: records.length, records }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, count: records.length, output: 'artifacts/v7-ui/raw-thumbnails' }, null, 2));
} finally {
  await browser.close();
}
