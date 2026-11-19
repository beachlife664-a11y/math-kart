import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

const errors = new WeakMap<Page, string[]>();
const raceStartTimeout = process.env.CI ? 60_000 : 15_000;

function monitor(page: Page): string[] {
  const messages: string[] = [];
  page.on('pageerror', (error) => messages.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(`console: ${message.text()}`);
  });
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

async function answerNext(page: Page, previousId: number, correct = true): Promise<any> {
  await expect.poll(async () => {
    const next = (await state(page)).question;
    return Boolean(next && next.id !== previousId && next.selectedIndex === null);
  }).toBe(true);
  const question = (await state(page)).question;
  const index = correct ? question.correctIndex : (question.correctIndex + 1) % 4;
  await page.locator('.answer-button').nth(index).click();
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

test('答案-only 自动驾驶、零答错罚速、连对强化、暂停与重开', async ({ page }) => {
  await page.getByRole('button', { name: '选择闪电号' }).click();
  await expect(page.getByRole('button', { name: '选择闪电号' })).toHaveClass(/selected/);
  await page.getByRole('button', { name: '开始比赛' }).click();
  await expect.poll(async () => (await state(page)).phase, { timeout: raceStartTimeout }).toBe('racing');
  await expect.poll(async () => Boolean((await state(page)).question)).toBe(true);
  expect((await state(page)).autoOnly).toBe(true);
  const before = (await state(page)).playerDistance;
  await page.waitForTimeout(1100);
  const moved = await state(page);
  expect(moved.playerDistance).toBeGreaterThan(before + 3);

  const firstQuestion = moved.question;
  const speedBeforeWrong = moved.racers.find((r: any) => r.isPlayer).speed;
  await page.locator('.answer-button').nth((firstQuestion.correctIndex + 1) % 4).click();
  await expect.poll(async () => (await state(page)).questionFeedback).toBe('wrong');
  const wrong = await state(page);
  expect(wrong.streak).toBe(0);
  expect(wrong.racers.find((r: any) => r.isPlayer).speed).toBeGreaterThanOrEqual(speedBeforeWrong - 0.5);
  await expect(page.locator('.answer-feedback')).toContainText('不停车、不倒退');

  const second = await answerNext(page, firstQuestion.id);
  await expect.poll(async () => (await state(page)).questionFeedback).toBe('correct');
  let current = await state(page);
  expect(current.correctCount).toBe(1);
  expect(current.streak).toBe(1);
  expect(current.boostRemaining).toBeGreaterThan(0);
  expect(current.energy).toBeGreaterThanOrEqual(26);
  let previousId = second.id;
  for (let count = 2; count <= 4; count += 1) {
    const answered = await answerNext(page, previousId);
    previousId = answered.id;
    await expect.poll(async () => (await state(page)).correctCount).toBe(count);
  }
  current = await state(page);
  expect(current.bestStreak).toBe(4);
  await expect.poll(async () => (await state(page)).powerUp).toBe('overdrive');

  await page.getByRole('button', { name: '暂停比赛' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('paused');
  const pausedAt = (await state(page)).elapsed;
  await page.waitForTimeout(500);
  expect((await state(page)).elapsed).toBeCloseTo(pausedAt, 3);
  await page.getByRole('button', { name: '继续比赛' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('racing');
  await page.getByRole('button', { name: '暂停比赛' }).click();
  await page.getByRole('button', { name: '重新发车' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('countdown');
  expect((await state(page)).correctCount).toBe(0);
});

test('300 道小学题答案、选项和难度约束成立', async () => {
  const { createMathQuestion } = await importTypeScript('../src/game/math.ts');
  const { createSeededRandom } = await importTypeScript('../src/game/random.ts');
  const random = createSeededRandom(20261117);
  const failures: string[] = [];
  for (let id = 1; id <= 300; id += 1) {
    const question = createMathQuestion(random, id);
    const answer = question.options[question.correctIndex];
    const compound = question.text.match(/(\d+)\s*×\s*(\d+)\s*\+\s*(\d+)/);
    const match = question.text.match(/(\d+)\s*([+−×÷])\s*(\d+)/);
    if (!match) { failures.push(`无法解析 ${question.text}`); continue; }
    const a = Number(match[1]);
    const b = Number(match[3]);
    const expected = compound
      ? Number(compound[1]) * Number(compound[2]) + Number(compound[3])
      : match[2] === '+' ? a + b : match[2] === '−' ? a - b : match[2] === '×' ? a * b : a / b;
    if (expected !== answer) failures.push(`${question.text} 答案错误`);
    if (new Set(question.options).size !== 4) failures.push(`${question.text} 选项重复`);
    if (!Number.isInteger(answer) || answer < 0 || answer > 150) failures.push(`${question.text} 超出小学范围`);
  }
  const report = { checked: 300, failures };
  expect(report).toEqual({ checked: 300, failures: [] });
});

test('两圈五车冲线排名、最佳成绩记录和再赛一场', async ({ page }) => {
  await setState(page, 'finished');
  await expect(page.locator('.results-panel')).toBeVisible();
  await expect(page.locator('.ranking-list li')).toHaveCount(5);
  expect(await page.locator('.rank-number').allTextContents()).toEqual(['1', '2', '3', '4', '5']);
  expect((await state(page)).racers[0].totalLaps).toBe(2);
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('math-kart:best')))).toBe(true);
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('math-kart:best')!));
  expect(best.time).toBeGreaterThan(0);
  expect(best.rank).toBeGreaterThanOrEqual(1);
  expect(best.rank).toBeLessThanOrEqual(5);
  await page.getByRole('button', { name: '再赛一场' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('countdown');
  await expect(page.locator('.results-panel')).toHaveCount(0);
});

test('开局车库支持七车切换、360度拖动、缩放重置与选车开赛', async ({ page }) => {
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
  await expect(page.getByRole('complementary', { name: '360度赛车展台' })).toBeVisible();
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.visibleKarts)).toBe(1);
  const thumbnails = page.locator('.kart-picker button img');
  await expect(thumbnails).toHaveCount(7);
  await expect.poll(() => thumbnails.evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 480 && image.naturalHeight === 300))).toBe(true);
  const canvas = page.locator('.game-canvas canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const initial = await page.evaluate(() => ({ ...window.__THREE_GAME_DIAGNOSTICS__.showroom }));
  await page.mouse.move(box!.x + box!.width * 0.76, box!.y + box!.height * 0.52);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging)).toBe(true);
  await page.mouse.move(box!.x + box!.width * 0.9, box!.y + box!.height * 0.59, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.yaw)).not.toBe(initial.yaw);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging)).toBe(false);
  await page.mouse.wheel(0, -240);
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.radius)).toBeLessThan(initial.radius);

  const showroomKarts = [
    { id: 'comet', name: '彗星号' },
    { id: 'reef', name: '浪花号' },
    { id: 'bolt', name: '闪电号' },
    { id: 'sprout', name: '嫩芽号' },
    { id: 'nova', name: '星辉号' },
    { id: 'titan', name: '巨石号' },
    { id: 'mochi', name: '麻薯号' },
  ];
  for (const spec of showroomKarts) {
    await page.getByRole('button', { name: `选择${spec.name}` }).click();
    await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.selectedKart)).toBe(spec.id);
    await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.visibleKarts)).toBe(1);
    await expect(page.getByRole('button', { name: `选择${spec.name}` })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: '下一台赛车' }).click();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.selectedKart)).toBe('comet');
  await page.getByRole('button', { name: '上一台赛车' }).click();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.selectedKart)).toBe('mochi');
  await page.getByRole('button', { name: '重置赛车视角' }).click();
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.yaw)).toBeCloseTo(0.68, 5);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.radius)).toBeCloseTo(4.5, 5);
  await page.getByRole('button', { name: '选择闪电号' }).click();
  await page.getByRole('button', { name: '开始比赛' }).click();
  await expect(page.locator('.start-panel')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.racers.find((racer) => racer.isPlayer)?.id)).toBe('bolt');
});

test('手机展台真实触摸可环绕、换车并重置后开赛', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:28474/?qa=1');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length === 7);
  expect(await page.locator('.start-panel').evaluate((panel) => panel.scrollHeight <= panel.clientHeight + 1 && panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  const initialYaw = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.yaw);
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 255, id: 1 }] });
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging)).toBe(true);
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + step * 17, y: 255 + step * 4, id: 1 }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.yaw)).not.toBe(initialYaw);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.dragging)).toBe(false);
  await page.getByRole('button', { name: '下一台赛车' }).tap();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.selectedKart)).toBe('reef');
  await page.getByRole('button', { name: '重置赛车视角' }).tap();
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.showroom.radius)).toBeCloseTo(6.4, 5);
  await page.getByRole('button', { name: '选择闪电号' }).tap();
  await page.getByRole('button', { name: '开始比赛' }).tap();
  await expect(page.locator('.start-panel')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.state.racers.find((racer) => racer.isPlayer)?.id)).toBe('bolt');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('手机真实触摸只答题、无方向踏板、旋转布局与渲染预算', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const messages = monitor(page);
  await page.goto('http://127.0.0.1:28474/?qa=1');
  await expect(page.locator('canvas')).toBeVisible();
  await setState(page, 'active-play');
  await expect.poll(async () => Boolean((await state(page)).question)).toBe(true);
  for (const name of ['向左转', '向右转', '加速', '刹车', '漂移']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  const before = (await state(page)).playerDistance;
  await page.waitForTimeout(1000);
  expect((await state(page)).playerDistance).toBeGreaterThan(before + 3);
  const question = (await state(page)).question;
  const answer = page.locator('.answer-button').nth(question.correctIndex);
  const box = await answer.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const cdp = await context.newCDPSession(page);
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await state(page)).correctCount).toBe(1);
  const mathBox = await page.locator('.math-panel').boundingBox();
  expect(mathBox).not.toBeNull();
  expect(mathBox!.x).toBeGreaterThanOrEqual(0);
  expect(mathBox!.y + mathBox!.height).toBeLessThanOrEqual(844);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => page.locator('canvas').evaluate((canvas) => canvas.clientWidth)).toBe(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const diagnostics = await page.evaluate(() => ({
    state: (window as any).__THREE_GAME_DIAGNOSTICS__.state,
    render: (window as any).__THREE_GAME_DIAGNOSTICS__.renderer.render,
    memory: (window as any).__THREE_GAME_DIAGNOSTICS__.renderer.memory,
  }));
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
    expect((await state(page)).sectionName).toBe(section);
  }
  const current = await state(page);
  expect(current.loadedLandmarks).toEqual(['harbor', 'lighthouse', 'cave', 'bridge']);
  await setState(page, 'airborne');
  const airborne = await state(page);
  expect(airborne.racers.find((r: any) => r.isPlayer).airHeight).toBeGreaterThan(1);
});
