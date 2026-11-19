import { expect, test, type Page } from '@playwright/test';

async function state(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__THREE_GAME_DIAGNOSTICS__.state);
}

async function audioState(page: Page): Promise<any> {
  return (await state(page)).audio;
}

async function setState(page: Page, name: string): Promise<void> {
  await page.evaluate(async (stateName) => {
    await (window as any).__THREE_GAME_TEST_HOOKS__.setState(stateName);
    (window as any).__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);
  }, name);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?qa=1');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).__THREE_GAME_DIAGNOSTICS__?.state));
});

test('双 BGM、采样音效、循环、暂停重开和静音均按真实场景工作', async ({ page }) => {
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

  expect((await audioState(page)).contextState).toBe('locked');
  await page.getByRole('button', { name: '选择浪花号' }).click();
  await expect.poll(async () => (await audioState(page)).activeMusic).toBe('menu');
  let audio = await audioState(page);
  expect(audio.contextState).toBe('running');
  expect(audio.loadedMusic.sort()).toEqual(['menu', 'race']);
  expect(audio.loadedSfx.sort()).toEqual(['boost', 'click', 'correct', 'countdown', 'drift', 'finish', 'impact', 'telegraph', 'wrong']);
  expect(audio.loadErrors).toEqual([]);
  expect(audio.sampleEvents.click).toBeGreaterThan(0);

  await page.waitForTimeout(8800);
  audio = await audioState(page);
  expect(audio.activeMusic).toBe('menu');
  expect(audio.musicVoices).toBe(1);

  await page.getByRole('button', { name: '开始比赛' }).click();
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('racing');
  await expect.poll(async () => (await audioState(page)).activeMusic).toBe('race');
  audio = await audioState(page);
  expect(audio.musicVoices).toBe(1);
  expect(audio.sampleEvents.countdown).toBeGreaterThanOrEqual(3);
  expect(audio.sampleEvents.boost).toBeGreaterThan(0);

  await expect.poll(async () => Boolean((await state(page)).question)).toBe(true);
  const question = (await state(page)).question;
  await page.locator('.answer-button').nth(question.correctIndex).click();
  await expect.poll(async () => (await audioState(page)).sampleEvents.correct ?? 0).toBeGreaterThan(0);

  await page.getByRole('button', { name: '暂停比赛' }).click();
  await expect.poll(async () => (await audioState(page)).contextState).toBe('suspended');
  expect((await audioState(page)).musicVoices).toBe(1);
  await page.getByRole('button', { name: '继续比赛' }).click();
  await expect.poll(async () => (await audioState(page)).contextState).toBe('running');
  await page.getByRole('button', { name: '暂停比赛' }).click();
  await page.getByRole('button', { name: '重新发车' }).click();
  await expect.poll(async () => (await state(page)).phase).toBe('countdown');
  await page.waitForTimeout(500);
  audio = await audioState(page);
  expect(audio.activeMusic).toBe('race');
  expect(audio.musicVoices).toBe(1);

  await page.getByRole('button', { name: '静音' }).click();
  await expect.poll(async () => (await audioState(page)).masterGain).toBeLessThan(0.01);
  expect((await audioState(page)).muted).toBe(true);
  await page.getByRole('button', { name: '开启声音' }).click();
  await expect.poll(async () => (await audioState(page)).masterGain).toBeGreaterThan(0.65);
  audio = await audioState(page);
  expect(audio.muted).toBe(false);
  expect(audio.loadErrors).toEqual([]);
  expect(audio.fallbackEvents.click ?? 0).toBe(0);
  expect(audio.fallbackEvents.correct ?? 0).toBe(0);
  expect(audio.fallbackEvents.countdown ?? 0).toBe(0);
  expect(errors).toEqual([]);
  expect(badResponses).toEqual([]);
});

test('真实路障接触会减速并恢复，护盾抵挡减速且碰撞音同步', async ({ page }) => {
  await page.getByRole('button', { name: '开始比赛' }).click();
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('racing');
  await setState(page, 'obstacle');
  await expect.poll(async () => (await state(page)).obstacleHits).toBe(1);
  let current = await state(page);
  const speedAfterHit = current.racers.find((racer: any) => racer.isPlayer).speed;
  expect(speedAfterHit).toBeLessThan(18);
  expect(speedAfterHit).toBeGreaterThanOrEqual(7);
  expect(current.collisionSlowRemaining).toBeGreaterThan(0);
  expect(current.autoStatus).toContain('碰撞减速');
  expect(current.eventLabel).toContain('碰到路障');
  await expect.poll(async () => (await audioState(page)).sampleEvents.impact ?? 0).toBeGreaterThan(0);
  const distanceAfterHit = current.playerDistance;
  await page.waitForTimeout(1200);
  current = await state(page);
  expect(current.playerDistance).toBeGreaterThan(distanceAfterHit + 5);
  expect(current.collisionSlowRemaining).toBe(0);
  expect(current.racers.find((racer: any) => racer.isPlayer).speed).toBeGreaterThan(15);

  await setState(page, 'shielded-obstacle');
  await expect.poll(async () => (await state(page)).eventLabel).toContain('护盾抵挡路障');
  current = await state(page);
  expect(current.collisionSlowRemaining).toBe(0);
  expect(current.obstacleHits).toBe(0);
  expect(current.shieldRemaining).toBeGreaterThan(0);
  expect(current.shieldRemaining).toBeLessThan(4);
  expect(current.racers.find((racer: any) => racer.isPlayer).speed).toBeGreaterThan(20);

  await setState(page, 'cliff');
  await expect.poll(async () => (await audioState(page)).sampleEvents.drift ?? 0).toBeGreaterThan(0);
});
