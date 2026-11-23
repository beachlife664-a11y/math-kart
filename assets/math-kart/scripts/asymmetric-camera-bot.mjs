import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:28474';
const output = new URL('../artifacts/v13-review-layout/', import.meta.url).pathname;
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const state = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state);
const visibility = () => page.evaluate(() => {
  const panels = [...document.querySelectorAll('.math-panel')].map((panel) => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  return window.__THREE_GAME_DIAGNOSTICS__.cameraRig.vehicles.map((vehicle) => ({
    ...vehicle,
    inViewport: vehicle.x > 0 && vehicle.x < innerWidth && vehicle.y > 0 && vehicle.y < innerHeight,
    coveredByPanel: panels.some((panel) => vehicle.x >= panel.left && vehicle.x <= panel.right && vehicle.y >= panel.top && vehicle.y <= panel.bottom),
  }));
});

async function answerAvailable(playerIndex) {
  const snapshot = await state();
  const question = snapshot.players[playerIndex].question;
  if (!question || question.submittedAnswer !== null || snapshot.phase !== 'racing') return;
  const panel = page.locator(`.math-panel[data-player-index="${playerIndex}"]`);
  for (const digit of String(question.answer)) await panel.locator(`[data-digit="${digit}"]`).click();
  await page.getByRole('button', { name: `P${playerIndex + 1} 确认答案` }).click();
}

async function untilCamera(mode, playerIndex, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const snapshot = await state();
    if (snapshot.cameraMode === mode) return snapshot;
    await answerAvailable(playerIndex);
    await page.waitForTimeout(90);
  }
  throw new Error(`Timed out waiting for ${mode}: ${JSON.stringify(await state())}`);
}

try {
  await page.goto(`${baseUrl}/?qa=1`);
  await page.getByRole('button', { name: /2 人同屏/ }).click();
  await page.getByRole('button', { name: '开始比赛' }).click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state?.phase === 'racing', { timeout: 30_000 });

  // 只让 P1 答题，使用真实屏幕数字键拉开差距。
  const split = await untilCamera('split', 0, 60_000);
  const splitVisibility = await visibility();
  await page.screenshot({ path: `${output}/desktop-dual-split-real-input.png` });

  // P1 停止，换 P2 真实答题追赶；不能通过跳关或改写距离合并。
  const merged = await untilCamera('shared', 1, 90_000);
  const mergedVisibility = await visibility();
  await page.screenshot({ path: `${output}/desktop-dual-merged-real-input.png` });

  const vehicleChecksPassed = [...splitVisibility, ...mergedVisibility].every((vehicle) => vehicle.inViewport && !vehicle.coveredByPanel);
  const report = {
    status: merged.cameraMode === 'shared' && merged.cameraSeparation < 18 && merged.phase === 'racing' && vehicleChecksPassed && errors.length === 0 ? 'passed' : 'failed',
    scenario: 'P1 连续答题拉开后分屏；P1 停止，P2 连续答题追赶后合并',
    split: {
      elapsed: split.elapsed,
      separation: split.cameraSeparation,
      p1Correct: split.players[0].correctCount,
      p2Correct: split.players[1].correctCount,
      vehicles: splitVisibility,
    },
    merged: {
      elapsed: merged.elapsed,
      separation: merged.cameraSeparation,
      p1Correct: merged.players[0].correctCount,
      p2Correct: merged.players[1].correctCount,
      phase: merged.phase,
      vehicles: mergedVisibility,
    },
    errors,
  };
  await writeFile(`${output}/asymmetric-camera-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
} finally {
  await browser.close();
}
