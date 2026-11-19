import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:28474/?qa=1';
const answerQuestions = process.env.ANSWERS !== '0';
const runName = process.env.RUN_NAME ?? (answerQuestions ? 'full-race-v6' : 'no-answer-v6');
const output = `artifacts/${runName}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: output, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()} @ ${message.location().url}`);
});
const startedAt = Date.now();
let initialFrame = 0;
let initialDistance = 0;
let lastDistance = 0;
let lastProgressAt = Date.now();
let softlockWindows = 0;
let answeredQuestion = 0;
let samples = 0;
let peakCalls = 0;
let peakTriangles = 0;
let peakState = null;
let telegraphsSeen = 0;
const sections = new Set();
const rewardEvents = new Set();

try {
  await page.goto(baseURL);
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_DIAGNOSTICS__?.state));
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.seed(42));
  await page.getByRole('button', { name: '开始比赛' }).click();
  const initial = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state);
  initialFrame = initial.frame;
  initialDistance = initial.playerDistance;
  lastDistance = initialDistance;

  while (Date.now() - startedAt < 180_000) {
    const snapshot = await page.evaluate(() => ({
      state: window.__THREE_GAME_DIAGNOSTICS__.state,
      render: window.__THREE_GAME_DIAGNOSTICS__.renderer.render,
    }));
    const { state, render } = snapshot;
    samples += 1;
    sections.add(state.sectionName);
    peakCalls = Math.max(peakCalls, render.calls);
    if (render.triangles > peakTriangles) {
      peakTriangles = render.triangles;
      peakState = state;
    }
    if (state.rivalAlert) telegraphsSeen += 1;
    if (/捷径|高速线|落地冲刺|加速线/.test(state.eventLabel)) rewardEvents.add(state.eventLabel);
    if (answerQuestions && state.phase === 'racing' && state.question && state.question.selectedIndex === null && state.question.id !== answeredQuestion) {
      answeredQuestion = state.question.id;
      await page.locator('.answer-button').nth(state.question.correctIndex).click();
    }
    if (state.playerDistance > lastDistance + 0.2) {
      lastDistance = state.playerDistance;
      lastProgressAt = Date.now();
    } else if (state.phase === 'racing' && Date.now() - lastProgressAt > 3000) {
      softlockWindows += 1;
      lastProgressAt = Date.now();
    }
    if (state.phase === 'finished') break;
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('.results-panel', { state: 'visible', timeout: 5000 });
  await page.screenshot({ path: `${output}/final-ranking.png` });
  const final = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state);
  const player = final.results.find((result) => result.isPlayer);
  const renderBudget = { calls: peakCalls <= 300, triangles: peakTriangles <= 750000 };
  const report = {
    ok: final.phase === 'finished' && final.results.length === 5 && softlockWindows <= 1 && errors.length === 0 && sections.size === 5 && renderBudget.calls && renderBudget.triangles && final.audio?.loadErrors?.length === 0 && final.audio?.musicVoices === 1 && (!answerQuestions || (player.rank <= 2 && final.routeRewards.length === 4)),
    seed: 42,
    input: answerQuestions ? 'start button + real answer clicks only; no driving keys, no setState hook' : 'start button only; no answers, no driving keys, no setState hook',
    wallSeconds: (Date.now() - startedAt) / 1000,
    framesAdvanced: final.frame - initialFrame,
    distanceTravelled: final.playerDistance - initialDistance,
    correctAnswers: final.correctCount,
    obstacleHits: final.obstacleHits,
    audio: final.audio,
    audioLoadErrors: final.audio?.loadErrors ?? ['missing diagnostics'],
    bestStreak: final.bestStreak,
    overtakes: final.overtakeCount,
    playerRank: player.rank,
    sections: [...sections],
    routeRewards: final.routeRewards,
    rewardEvents: [...rewardEvents],
    telegraphSamples: telegraphsSeen,
    softlockWindows,
    samples,
    peakCalls,
    peakTriangles,
    renderBudget,
    peakState,
    results: final.results,
    errors,
  };
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(`${output}/full-race.webm`);
  await context.close();
  await browser.close();
}
