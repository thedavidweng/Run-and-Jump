import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

type CanvasSample = {
  ok: boolean;
  reason: string;
  variance?: number;
  colorBuckets?: number;
};

async function sampleCanvas(page: Page): Promise<CanvasSample> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) {
    return { ok: false, reason: 'canvas-too-small' };
  }

  const buffer = await canvas.screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) alphaPixels += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }

  const variance = max - min;
  return {
    ok: alphaPixels > 256 && (variance > 8 || buckets.size > 3),
    reason: 'sampled',
    variance,
    colorBuckets: buckets.size,
  };
}

function diag(page: Page): Promise<ThreeGameDiagnostics | undefined> {
  return page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
}

async function press(page: Page, mobile: boolean): Promise<void> {
  if (mobile) {
    const box = await page.locator('#game-canvas').boundingBox();
    if (!box) throw new Error('no canvas box');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await page.keyboard.press('Space');
  }
}

test('endless runner core loop: start, jump, slide, die, restart', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes('mobile');
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10, undefined, {
    timeout: 15_000,
  });

  // Title screen renders a live (nonblank) world.
  expect((await diag(page))?.phase).toBe('ready');
  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });
  await testInfo.attach(`${testInfo.project.name}-title`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // Press starts the run.
  await press(page, mobile);
  await expect.poll(async () => (await diag(page))?.phase).toBe('playing');

  // Press again: the player must actually leave the ground (real input path).
  // A tap is guaranteed a ~1.2-high hop by the min-rise grace window.
  await page.waitForTimeout(250);
  await press(page, mobile);
  await expect.poll(async () => (await diag(page))?.player.y ?? 0, { timeout: 4_000 }).toBeGreaterThan(0.5);

  // Slide: ↓ on desktop, a touch held on the bottom strip on mobile.
  await expect.poll(async () => (await diag(page))?.player.grounded).toBe(true);
  if (mobile) {
    await page.evaluate(() => {
      document.querySelector('#game-canvas')!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 77,
          pointerType: 'touch',
          clientY: window.innerHeight * 0.92,
          clientX: window.innerWidth / 2,
        }),
      );
    });
  } else {
    await page.keyboard.down('ArrowDown');
  }
  await expect.poll(async () => (await diag(page))?.player.sliding, { timeout: 4_000 }).toBe(true);
  expect((await diag(page))?.player.y).toBe(0);
  if (mobile) {
    await page.evaluate(() => {
      document.querySelector('#game-canvas')!.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 77, pointerType: 'touch' }),
      );
    });
  } else {
    await page.keyboard.up('ArrowDown');
  }
  await expect.poll(async () => (await diag(page))?.player.sliding, { timeout: 4_000 }).toBe(false);

  // Distance and score progress while running.
  await expect.poll(async () => (await diag(page))?.distance ?? 0, { timeout: 8_000 }).toBeGreaterThan(6);
  const running = await diag(page);
  expect(running?.score ?? 0).toBeGreaterThan(0);

  await testInfo.attach(`${testInfo.project.name}-playing`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // Idle (no more jumps): the first spike chart guarantees a death.
  await expect.poll(async () => (await diag(page))?.phase, { timeout: 30_000 }).toBe('dead');
  await expect(page.locator('#overlay-dead')).toBeVisible();
  await testInfo.attach(`${testInfo.project.name}-dead`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // Same button restarts and fully resets the run.
  await page.waitForTimeout(600);
  await press(page, mobile);
  await expect.poll(async () => (await diag(page))?.phase).toBe('playing');
  const restarted = await diag(page);
  expect(restarted?.distance ?? 99).toBeLessThan(6);
  expect(restarted?.combo ?? 99).toBe(0);

  const ignorableErrors = [/WebGPU/i, /GPU stall/i, /powerPreference/i];
  const blockingConsole = consoleErrors.filter((text) => !ignorableErrors.some((re) => re.test(text)));
  expect(blockingConsole).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('i18n: auto-detects browser language, switches and persists', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, undefined, {
    timeout: 20_000,
  });

  // Playwright's default locale is en-US → English UI, no mixed languages.
  await expect(page.locator('#overlay-title .prompt')).toContainText('Space');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await expect(page.locator('#hint-line')).not.toContainText('空格');

  // Switch from the main menu.
  await page.locator('[data-lang="zh"]').click();
  await expect(page.locator('#overlay-title .prompt')).toContainText('空格');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('zh-CN');
  await expect(page.locator('[data-lang="zh"]')).toHaveClass(/active/);

  // Choice persists across reloads.
  await page.reload();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator('#overlay-title .prompt')).toContainText('空格');
});
