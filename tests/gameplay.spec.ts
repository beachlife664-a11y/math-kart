import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

const errors = new WeakMap<Page, string[]>();
const raceStartTimeout = process.env.CI ? 60_000 : 20_000;

function monitor(page: Page): string[] {
  const messages: string[] = [];
  page.on('pageerror', (error) => messages.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') messages.push(`console: ${message.text()}`); });
  errors.set(page, messages);
  return messages;
}

async function importTypeScript(relativePath: string): Promise<any> {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const output = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2020 } }).outputText;
  const fileName = relativePath.split('/').pop()!.replace(/\.ts$/, '.mjs');
  const compiledUrl = new URL(`../test-results/compiled-${fileName}`, import.meta.url);
  await writeFile(compiledUrl, output);
  return import(compiledUrl.href);
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__THREE_GAME_DIAGNOSTICS__.state);
}

async function setState(page: Page, name: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__THREE_GAME_TEST_HOOKS__));
  await page.evaluate(async (stateName) => {
    await (window as any).__THREE_GAME_TEST_HOOKS__.setState(stateName);
    (window as any).__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);
  }, name);
}

async function startRace(page: Page, playerCount: 1 | 2 = 1): Promise<void> {
  if (playerCount === 2) await page.getByRole('button', { name: /2 人同屏/ }).click();
  await page.getByRole('button', { name: '开始比赛' }).click();
  await expect.poll(async () => (await state(page)).phase, { timeout: raceStartTimeout }).toBe('racing');
  await expect.poll(async () => (await state(page)).players.every((player: any) => Boolean(player.question))).toBe(true);
}

async function clickAnswer(page: Page, playerIndex: 0 | 1, value: number): Promise<void> {
  const panel = page.locator(`.math-panel[data-player-index="${playerIndex}"]`);
  for (const digit of String(value)) await panel.locator(`[data-digit="${digit}"]`).click();
  await page.getByRole('button', { name: `P${playerIndex + 1} 确认答案` }).click();
}

async function expectVehiclesClearOfPanels(page: Page): Promise<void> {
  const visibility = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    vehicles: (window as any).__THREE_GAME_DIAGNOSTICS__.cameraRig.vehicles,
    panels: [...document.querySelectorAll('.math-panel')].map((panel) => {
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  }));
  expect(visibility.vehicles).toHaveLength(visibility.panels.length);
  for (const vehicle of visibility.vehicles) {
    expect(vehicle.x).toBeGreaterThan(0);
    expect(vehicle.x).toBeLessThan(visibility.width);
    expect(vehicle.y).toBeGreaterThan(0);
    expect(vehicle.y).toBeLessThan(visibility.height);
    for (const panel of visibility.panels) {
      const covered = vehicle.x >= panel.left && vehicle.x <= panel.right && vehicle.y >= panel.top && vehicle.y <= panel.bottom;
      expect(covered, `P${vehicle.playerIndex + 1} 车辆中心不能被答题面板覆盖`).toBe(false);
    }
  }
}

async function answerNext(page: Page, previousId: number, correct = true): Promise<any> {
  await expect.poll(async () => {
    const next = (await state(page)).players[0].question;
    return Boolean(next && next.id !== previousId && next.submittedAnswer === null);
  }).toBe(true);
  const question = (await state(page)).players[0].question;
  await clickAnswer(page, 0, correct ? question.answer : question.answer + 1);
  return question;
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(process.env.CI ? 120_000 : 30_000);
  page.setDefaultNavigationTimeout(process.env.CI ? 120_000 : 30_000);
  monitor(page);
  await page.goto('/?qa=1');
  await expect(page.locator('canvas')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('单人和双人均只生成真实玩家赛车，数字输入与答题奖励正常', async ({ page }) => {
  await startRace(page);
  let current = await state(page);
  expect(current.playerCount).toBe(1);
  expect(current.racers).toHaveLength(1);
  expect(current.racers.every((racer: any) => racer.isPlayer)).toBe(true);
  expect(current.autoOnly).toBe(true);
  const before = current.playerDistance;
  await page.waitForTimeout(1100);
  current = await state(page);
  expect(current.playerDistance).toBeGreaterThan(before + 3);

  const firstQuestion = current.players[0].question;
  const speedBeforeWrong = current.racers[0].speed;
  await clickAnswer(page, 0, firstQuestion.answer + 1);
  await expect.poll(async () => (await state(page)).players[0].questionFeedback).toBe('wrong');
  const wrong = await state(page);
  expect(wrong.players[0].streak).toBe(0);
  expect(wrong.racers[0].speed).toBeGreaterThanOrEqual(speedBeforeWrong - 0.5);
  await expect(page.locator('.math-panel[data-player-index="0"] .answer-feedback')).toContainText('继续加油');

  const second = await answerNext(page, firstQuestion.id);
  await expect.poll(async () => (await state(page)).players[0].questionFeedback).toBe('correct');
  current = await state(page);
  expect(current.players[0].correctCount).toBe(1);
  expect(current.players[0].streak).toBe(1);
  expect(current.players[0].boostRemaining).toBeGreaterThan(0);
  expect(current.players[0].energy).toBeGreaterThanOrEqual(26);
  let previousId = second.id;
  for (let count = 2; count <= 4; count += 1) {
    const answered = await answerNext(page, previousId);
    previousId = answered.id;
    await expect.poll(async () => (await state(page)).players[0].correctCount).toBe(count);
  }
  current = await state(page);
  expect(current.players[0].bestStreak).toBe(4);
  await expect.poll(async () => (await state(page)).players[0].powerUp).toBe('overdrive');

  await page.getByRole('button', { name: '暂停比赛' }).click();
  await expect(page.locator('.math-panel .keypad-key').first()).toBeDisabled();
  const pausedAt = (await state(page)).elapsed;
  await page.waitForTimeout(500);
  expect((await state(page)).elapsed).toBeCloseTo(pausedAt, 3);
  await page.getByRole('button', { name: '重新发车' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('countdown');
  await expect(page.locator('.math-panel .keypad-key').first()).toBeDisabled();
  expect((await state(page)).players[0].correctCount).toBe(0);
});

test('双人主键盘与小键盘同时输入，正误、能量和加速互不串线', async ({ page }) => {
  await startRace(page, 2);
  let current = await state(page);
  expect(current.playerCount).toBe(2);
  expect(current.racers).toHaveLength(2);
  expect(current.racers.map((racer: any) => racer.playerIndex)).toEqual([0, 1]);
  expect(current.racers.every((racer: any) => racer.isPlayer)).toBe(true);
  const p1Answer = current.players[0].question.answer;
  const p2Wrong = current.players[1].question.answer + 1;
  const p1Digits = String(p1Answer).split('');
  const p2Digits = String(p2Wrong).split('');
  const length = Math.max(p1Digits.length, p2Digits.length);
  for (let index = 0; index < length; index += 1) {
    if (p1Digits[index]) await page.keyboard.press(`Digit${p1Digits[index]}`);
    if (p2Digits[index]) await page.keyboard.press(`Numpad${p2Digits[index]}`);
  }
  current = await state(page);
  expect(current.players[0].answerInput).toBe(String(p1Answer));
  expect(current.players[1].answerInput).toBe(String(p2Wrong));
  await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('NumpadEnter')]);
  await expect.poll(async () => (await state(page)).players[0].questionFeedback).toBe('correct');
  await expect.poll(async () => (await state(page)).players[1].questionFeedback).toBe('wrong');
  current = await state(page);
  expect(current.players[0].correctCount).toBe(1);
  expect(current.players[0].streak).toBe(1);
  expect(current.players[0].energy).toBe(26);
  expect(current.players[0].boostRemaining).toBeGreaterThan(0);
  expect(current.players[1].correctCount).toBe(0);
  expect(current.players[1].streak).toBe(0);
  expect(current.players[1].energy).toBe(0);
  expect(current.players[1].question.submittedAnswer).toBe(p2Wrong);
  expect(current.players[0].question.submittedAnswer).toBe(p1Answer);
  await expect(page.locator('.math-panel[data-player-index="0"] .answer-feedback')).toContainText('太棒了');
  await expect(page.locator('.math-panel[data-player-index="1"] .answer-feedback')).toContainText(`答案是 ${current.players[1].question.answer}`);
});

test('双人屏幕数字键、退格、清空和独立新题可用', async ({ page }) => {
  await startRace(page, 2);
  const p1 = page.locator('.math-panel[data-player-index="0"]');
  const p2 = page.locator('.math-panel[data-player-index="1"]');
  await p1.locator('[data-digit="1"]').click();
  await p2.locator('[data-digit="9"]').click();
  expect((await state(page)).players.map((player: any) => player.answerInput)).toEqual(['1', '9']);
  await p1.getByRole('button', { name: 'P1 退格' }).click();
  await p2.getByRole('button', { name: 'P2 清空输入' }).click();
  expect((await state(page)).players.map((player: any) => player.answerInput)).toEqual(['', '']);
  const firstIds = (await state(page)).players.map((player: any) => player.question.id);
  const current = await state(page);
  await clickAnswer(page, 0, current.players[0].question.answer);
  await expect.poll(async () => (await state(page)).players[0].question?.id !== firstIds[0]).toBe(true);
  expect((await state(page)).players[1].question.id).toBe(firstIds[1]);
});

test('300 道小学题为确定整数答案，不再生成选择题选项', async () => {
  const { createMathQuestion } = await importTypeScript('../src/game/math.ts');
  const { createSeededRandom } = await importTypeScript('../src/game/random.ts');
  const random = createSeededRandom(20261117);
  const failures: string[] = [];
  for (let id = 1; id <= 300; id += 1) {
    const question = createMathQuestion(random, id);
    const compound = question.text.match(/(\d+)\s*×\s*(\d+)\s*\+\s*(\d+)/);
    const match = question.text.match(/(\d+)\s*([+−×÷])\s*(\d+)/);
    if (!match) { failures.push(`无法解析 ${question.text}`); continue; }
    const a = Number(match[1]);
    const b = Number(match[3]);
    const expected = compound ? Number(compound[1]) * Number(compound[2]) + Number(compound[3]) : match[2] === '+' ? a + b : match[2] === '−' ? a - b : match[2] === '×' ? a * b : a / b;
    if (expected !== question.answer) failures.push(`${question.text} 答案错误`);
    if ('options' in question || 'correctIndex' in question) failures.push(`${question.text} 仍是选择题`);
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 150) failures.push(`${question.text} 超出小学范围`);
  }
  expect({ checked: 300, failures }).toEqual({ checked: 300, failures: [] });
});

test('双车库七车独立选择、两圈双人结算与再来一局', async ({ page }) => {
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
  await page.getByRole('button', { name: /2 人同屏/ }).click();
  await expect(page.locator('.kart-picker button img')).toHaveCount(14);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.visibleKarts)).toBe(2);
  await page.getByRole('button', { name: 'P1 选择闪电号' }).click();
  await page.getByRole('button', { name: 'P2 选择星辉号' }).click();
  let current = await state(page);
  expect(current.selectedKarts).toEqual(['bolt', 'nova']);
  await expect(page.getByRole('button', { name: 'P1 选择星辉号' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'P2 选择闪电号' })).toBeDisabled();
  const thumbnails = page.locator('.kart-picker button img');
  await expect.poll(() => thumbnails.evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 480 && image.naturalHeight === 300))).toBe(true);
  await setState(page, 'finished');
  await expect(page.locator('.results-panel')).toBeVisible();
  await expect(page.locator('.ranking-list li')).toHaveCount(2);
  expect(await page.locator('.rank-number').allTextContents()).toEqual(['1', '2']);
  current = await state(page);
  expect(current.racers).toHaveLength(2);
  expect(current.racers[0].totalLaps).toBe(2);
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('math-kart:best')))).toBe(true);
  await page.getByRole('button', { name: '同配置再赛一场' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('countdown');
  expect((await state(page)).playerCount).toBe(2);
  await expect(page.locator('.results-panel')).toHaveCount(0);
});

test('1080P 上下卡通看板不遮赛道，大算式和触控目标无溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await startRace(page, 2);
  await expect(page.locator('.math-panel')).toHaveCount(2);
  const canvas = await page.locator('.game-canvas').boundingBox();
  expect(canvas).not.toBeNull();
  expect(canvas!.width).toBe(1920);
  expect(canvas!.height).toBe(648);
  const panels = await page.locator('.math-panel').evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const formula = item.querySelector('.question-text strong')!;
    const key = item.querySelector('.keypad-key')!;
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, formulaSize: Number.parseFloat(getComputedStyle(formula).fontSize), keyHeight: key.getBoundingClientRect().height, overflow: item.scrollHeight > item.clientHeight || item.scrollWidth > item.clientWidth };
  }));
  for (const panel of panels) {
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(648);
    expect(panel.right).toBeLessThanOrEqual(1920);
    expect(panel.bottom).toBeLessThanOrEqual(1080);
    expect(panel.width).toBeCloseTo(929, 0);
    expect(panel.height).toBeCloseTo(398, 0);
    expect(panel.formulaSize).toBeGreaterThanOrEqual(70);
    expect(panel.keyHeight).toBeGreaterThanOrEqual(71);
    expect(panel.overflow).toBe(false);
  }
  expect(panels[1].x - panels[0].right).toBeCloseTo(18, 0);
  await expectVehiclesClearOfPanels(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/v13-review-layout/desktop-dual-1920.png' });
});

test('单人使用居中大面板，桌面窗口缩放后仍保持上下分区', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await startRace(page);
  await expect(page.locator('.math-panel')).toHaveCount(1);
  let panel = await page.locator('.math-panel').boundingBox();
  expect(panel).not.toBeNull();
  expect(panel!.width).toBe(1080);
  expect(panel!.x).toBe(420);
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(() => page.locator('.game-canvas').evaluate((canvas) => canvas.clientHeight)).toBe(461);
  panel = await page.locator('.math-panel').boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(460);
  expect(await page.locator('.math-panel .keypad-key').first().evaluate((key) => key.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: 'artifacts/v13-review-layout/desktop-single-resized.png' });
});

test('较小双人桌面保留独立大键盘且不产生页面溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startRace(page, 2);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 900, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('.game-canvas').evaluate((canvas) => canvas.clientWidth)).toBe(viewport.width);
    const metrics = await page.locator('.math-panel').evaluateAll((items) => items.map((item) => ({
      keyHeight: item.querySelector('.keypad-key')!.getBoundingClientRect().height,
      overflow: item.scrollHeight > item.clientHeight || item.scrollWidth > item.clientWidth,
    })));
    expect(metrics).toHaveLength(2);
    for (const metric of metrics) {
      expect(metric.keyHeight).toBeGreaterThanOrEqual(44);
      expect(metric.overflow).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/v13-review-layout/desktop-dual-compact.png' });
});

test('双人拉开后稳定分屏，接近后合并且相机参数有效', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => (window as any).__THREE_GAME_TEST_HOOKS__.setPlayerCount(2));
  await setState(page, 'active-play');
  await page.evaluate(() => (window as any).__THREE_GAME_TEST_HOOKS__.setCameraGap(48));
  await expect.poll(async () => (await state(page)).cameraMode).toBe('split');
  await expect(page.locator('.split-camera-divider')).toBeVisible();
  const splitCamera = await page.evaluate(() => (window as any).__THREE_GAME_DIAGNOSTICS__.cameraRig);
  expect(splitCamera.primary.aspect).toBeCloseTo(1920 / 2 / 648, 4);
  expect(splitCamera.secondary.aspect).toBeCloseTo(1920 / 2 / 648, 4);
  expect([...splitCamera.primary.position, ...splitCamera.secondary.position].every(Number.isFinite)).toBe(true);
  await page.waitForTimeout(1300);
  expect((await state(page)).cameraMode).toBe('split');
  await expectVehiclesClearOfPanels(page);
  await page.screenshot({ path: 'artifacts/v13-review-layout/desktop-dual-split.png' });
  await page.evaluate(() => (window as any).__THREE_GAME_TEST_HOOKS__.setCameraGap(10));
  await expect.poll(async () => (await state(page)).cameraMode).toBe('shared');
  await expect(page.locator('.split-camera-divider')).toHaveCount(0);
  const sharedCamera = await page.evaluate(() => (window as any).__THREE_GAME_DIAGNOSTICS__.cameraRig);
  expect(sharedCamera.primary.aspect).toBeCloseTo(1920 / 648, 4);
  await expectVehiclesClearOfPanels(page);
  await page.screenshot({ path: 'artifacts/v13-review-layout/desktop-dual-merged.png' });
});

test('手机真实触摸数字答题、旋转布局与渲染预算', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const messages = monitor(page);
  await page.goto('http://127.0.0.1:28474/?qa=1');
  await expect(page.locator('canvas')).toBeVisible();
  await setState(page, 'active-play');
  await expect.poll(async () => Boolean((await state(page)).players[0].question)).toBe(true);
  for (const name of ['向左转', '向右转', '加速', '刹车', '漂移']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  const question = (await state(page)).players[0].question;
  const firstDigit = String(question.answer)[0];
  const key = page.locator(`.math-panel[data-player-index="0"] [data-digit="${firstDigit}"]`);
  const box = await key.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(38);
  expect(box!.height).toBeGreaterThanOrEqual(38);
  const cdp = await context.newCDPSession(page);
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await state(page)).players[0].answerInput).toBe(firstDigit);
  await page.screenshot({ path: 'artifacts/v13-review-layout/mobile-numeric-input.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => page.locator('canvas').evaluate((canvas) => canvas.clientWidth)).toBe(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const diagnostics = await page.evaluate(() => ({ render: (window as any).__THREE_GAME_DIAGNOSTICS__.renderer.render, memory: (window as any).__THREE_GAME_DIAGNOSTICS__.renderer.memory }));
  expect(diagnostics.render.calls).toBeLessThanOrEqual(150);
  expect(diagnostics.render.triangles).toBeLessThanOrEqual(300_000);
  expect(diagnostics.memory.geometries).toBeLessThanOrEqual(200);
  expect(diagnostics.memory.textures).toBeLessThanOrEqual(40);
  expect(messages).toEqual([]);
  await context.close();
});

test('五段高差、四个 Hyper3D 地标与跳台状态可实际进入', async ({ page }) => {
  for (const [hook, section] of [['harbor', '彩色港口'], ['cliff', '山崖盘山道'], ['cave', '水晶洞穴'], ['bridge', '跨海大桥']] as const) {
    await setState(page, hook);
    expect((await state(page)).players[0].sectionName).toBe(section);
  }
  expect((await state(page)).loadedLandmarks).toEqual(['harbor', 'lighthouse', 'cave', 'bridge']);
  await setState(page, 'airborne');
  expect((await state(page)).racers[0].airHeight).toBeGreaterThan(1);
});
