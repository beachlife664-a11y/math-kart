import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const manifestPath = option('--manifest', 'artifacts/reproduction-manifest.json');
const baseURL = option('--url', process.env.BASE_URL ?? 'http://127.0.0.1:28474/?qa=1');
const seed = Number(option('--seed', '42'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.runId || !manifest.captures?.length) throw new Error('Manifest requires runId and non-empty captures.');

function pixels(buffer) {
  const image = PNG.sync.read(buffer);
  const histogram = new Uint32Array(4096);
  const luminance = [];
  let edges = 0;
  const lumAt = (x, y) => {
    const index = (y * image.width + x) * 4;
    return image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
  };
  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const index = (y * image.width + x) * 4;
      const key = ((image.data[index] >> 4) << 8) | ((image.data[index + 1] >> 4) << 4) | (image.data[index + 2] >> 4);
      histogram[key] += 1;
      const lum = lumAt(x, y);
      luminance.push(lum);
      if ((x + 2 < image.width && Math.abs(lum - lumAt(x + 2, y)) > 18) || (y + 2 < image.height && Math.abs(lum - lumAt(x, y + 2)) > 18)) edges += 1;
    }
  }
  const total = luminance.length;
  let entropy = 0;
  let dominant = 0;
  for (const count of histogram) {
    if (!count) continue;
    const share = count / total;
    entropy -= share * Math.log2(share);
    dominant = Math.max(dominant, share);
  }
  luminance.sort((a, b) => a - b);
  const quantile = (q) => luminance[Math.min(total - 1, Math.floor(total * q))];
  const contrast = quantile(0.95) - quantile(0.05);
  return {
    colorBuckets: histogram.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0),
    colorEntropyBits: Number(entropy.toFixed(2)),
    edgeDensity: Number((edges / total).toFixed(3)),
    luminance: { mean: Number((luminance.reduce((sum, value) => sum + value, 0) / total).toFixed(1)), p5: Number(quantile(0.05).toFixed(1)), p95: Number(quantile(0.95).toFixed(1)), contrast: Number(contrast.toFixed(1)) },
    dominantColorShare: Number(dominant.toFixed(3)),
    nonBackgroundShare: Number((1 - dominant).toFixed(3)),
  };
}

const browser = await chromium.launch({ channel: 'chromium', headless: true });
let failed = false;
try {
  for (const capture of manifest.captures) {
    const mobile = capture.mode === 'mobile';
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    const screenshotPath = capture.report.replace(/\.json$/, '.png');
    await mkdir(path.dirname(capture.report), { recursive: true });
    let appliedState = capture.state;
    try {
      await page.goto(baseURL);
      await page.waitForSelector('canvas', { state: 'visible' });
      await page.waitForFunction(() => Boolean(window.__THREE_GAME_DIAGNOSTICS__?.state));
      await page.evaluate((value) => window.__THREE_GAME_TEST_HOOKS__.seed(value), seed);
      if (capture.state) {
        appliedState = await page.evaluate(async (state) => {
          const result = await window.__THREE_GAME_TEST_HOOKS__.setState(state);
          window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
          return result.state;
        }, capture.state);
      }
      await page.waitForTimeout(650);
      const snapshot = await page.evaluate(() => {
        const info = window.__THREE_GAME_DIAGNOSTICS__.renderer;
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: { render: { ...info.render }, memory: { ...info.memory } },
          gpu: {
            renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
            vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : 'unavailable',
          },
        };
      });
      const metrics = pixels(await page.screenshot({ path: screenshotPath }));
      const limits = mobile ? { calls: 150, triangles: 300000, geometries: 200, textures: 40 } : { calls: 300, triangles: 750000, geometries: 300, textures: 60 };
      const actual = { calls: snapshot.renderer.render.calls, triangles: snapshot.renderer.render.triangles, geometries: snapshot.renderer.memory.geometries, textures: snapshot.renderer.memory.textures };
      const rows = Object.entries(limits).map(([metric, limit]) => ({ metric, actual: actual[metric], limit, ok: actual[metric] <= limit }));
      const stateOK = !capture.state || appliedState === capture.state;
      const nonblank = metrics.colorBuckets > 16 && metrics.colorEntropyBits > 1 && metrics.luminance.contrast > 10;
      const ok = stateOK && nonblank && errors.length === 0 && rows.every((row) => row.ok);
      const report = {
        url: baseURL, mode: capture.mode, state: capture.state, requestedState: capture.state,
        appliedState, runId: manifest.runId, seed, screenshotPath,
        gpu: { ...snapshot.gpu, softwareRendered: /swiftshader|llvmpipe|software/i.test(snapshot.gpu.renderer) },
        result: {
          ok, reason: nonblank ? 'nonblank' : 'blank-or-flat', metrics,
          renderBudget: { tier: capture.mode, rows, withinBudget: rows.every((row) => row.ok) },
          diagnostics: { renderer: snapshot.renderer }, errors,
        },
      };
      await writeFile(capture.report, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${capture.mode} ${capture.state ?? 'current'} run=${manifest.runId} gpu=${report.gpu.softwareRendered ? 'software' : 'hardware'} entropy=${metrics.colorEntropyBits} edges=${metrics.edgeDensity} contrast=${metrics.luminance.contrast} budget=${report.result.renderBudget.withinBudget ? 'ok' : 'over'} report=${capture.report}`);
      if (!ok) failed = true;
    } catch (error) {
      failed = true;
      console.error(`FAIL ${capture.mode} ${capture.state}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
