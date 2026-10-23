import { test, expect, type Page } from '@playwright/test';
import { createSession, commitDecision, getTask, recordTrial } from '../../src/core/calibration';
import { defaultSetup } from '../../src/core/games';
import { initialState } from '../../src/core/schema';
import { snapPosition } from '../../src/core/motion';
import type { AppState, CalibrationSession } from '../../src/core/types';
test.beforeEach(async ({ page }) => {
  if (process.env.CI) {
    // Hosted Windows runners use CPU rasterization. Reduce only the backing
    // resolution of WebGL canvases; CSS geometry, input, clocks, and scoring
    // remain unchanged. Real desktop/portable smoke tests use full resolution.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 0.25 });
    });
  }
});
async function advanceTrial(page: Page, milliseconds: number) {
  // Advance in bounded display frames rather than rendering thousands of
  // software-rasterized frames on hosted runners. Keep the suspension guard
  // active: no step is large enough to count as a stalled renderer.
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 200) {
    await page.clock.fastForward(Math.min(200, milliseconds - elapsed));
  }
}
async function seed(page: Page, state: AppState) {
  await page.addInitScript((state) => {
    if (!localStorage.getItem('test-seeded')) {
      localStorage.setItem('sensiviti.v1', JSON.stringify(state));
      localStorage.setItem('test-seeded', 'yes');
    }
  }, state);
}
function toReview() {
  let s = createSession(defaultSetup);
  while (!s.review) {
    const t = getTask(s)!;
    const score = t.candidate === 'higher' ? 0.8 : 0.4;
    s = recordTrial(s, t, {
      duration: t.duration,
      onTargetSeconds: score * t.duration,
      meanAngularError: 2,
      shots: 10,
      hits: 5,
      acquisitionTimes: [0.5],
      score,
    });
  }
  return s;
}
function completed() {
  let s = createSession(defaultSetup);
  while (s.phase !== 'complete') {
    if (s.review) {
      s = commitDecision(s);
      continue;
    }
    const t = getTask(s)!;
    const score = t.candidate === 'higher' || t.candidate === 'result' ? 0.8 : 0.4;
    s = recordTrial(s, t, {
      duration: t.duration,
      onTargetSeconds: score * t.duration,
      meanAngularError: 2,
      shots: 10,
      hits: 5,
      acquisitionTimes: [0.5],
      score,
    });
  }
  return s;
}

test('first-run setup, validation, persistence, navigation, and game library', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your feel' })).toBeVisible();
  await page.screenshot({ path: 'test-results/setup.png', fullPage: true });
  await page.getByLabel('Mouse DPI').fill('0');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('100');
  await page.getByLabel('Mouse DPI').fill('1600');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make the range your own.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Save & explore' }).click();
  await expect(page.getByRole('heading', { name: 'Your aim, in focus' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your aim, in focus' })).toBeVisible();
  await expect(page.locator('.device-badge')).toContainText('1600');
  await page.getByRole('button', { name: 'My games' }).click();
  await expect(page.locator('.conversion-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Apex Legends', exact: true }).click();
  await expect(page.locator('.conversion-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Apex Legends', exact: true }).click();
  await expect(page.locator('.conversion-card')).toHaveCount(3);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy setting', exact: true }).first().click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('sensitivity 1');
  await page.getByRole('button', { name: 'Session history' }).click();
  await expect(page.getByText('Your first session is a fresh page.')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Keep your progress' })).toBeVisible();
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  expect(errors).toEqual([]);
});
test('raw input rejection blocks a trial and preserves resumable state', async ({ page }) => {
  await seed(page, { ...initialState(), setup: defaultSetup });
  await page.addInitScript(() => {
    HTMLElement.prototype.requestPointerLock = () =>
      Promise.reject(new DOMException('Raw input unavailable', 'NotSupportedError'));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Calibration', exact: false }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Begin trial' }).click();
  await expect(page.getByRole('heading', { name: 'Let’s check your input.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry input' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sensiviti.v1')!).pending.trials.length,
    ),
  ).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume session' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume session' }).click();
  await expect(page.getByRole('button', { name: 'Begin trial' })).toBeVisible();
});
test('review supports overrides, repeat, and automatic five-second progression', async ({
  page,
}) => {
  await seed(page, { ...initialState(), setup: defaultSetup, pending: toReview() });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume session' }).click();
  await expect(page.getByRole('heading', { name: 'Higher is looking better.' })).toBeVisible();
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Begin trial' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sensiviti.v1')!).pending.decisions[0].overridden,
    ),
  ).toBe(true);
  await page.evaluate((s) => localStorage.setItem('sensiviti.v1', JSON.stringify(s)), {
    ...initialState(),
    setup: defaultSetup,
    pending: toReview(),
  });
  await page.reload();
  await page.getByRole('button', { name: 'Resume session' }).click();
  await page.getByRole('button', { name: 'Repeat R', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Begin trial' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sensiviti.v1')!).pending.trials.length,
    ),
  ).toBe(3);
  await page.evaluate((s) => localStorage.setItem('sensiviti.v1', JSON.stringify(s)), {
    ...initialState(),
    setup: defaultSetup,
    pending: toReview(),
  });
  await page.reload();
  await page.getByRole('button', { name: 'Resume session' }).click();
  await page.clock.install();
  await page.getByRole('button', { name: 'Resume timer' }).click();
  await page.clock.runFor(5100);
  await expect(page.getByRole('button', { name: 'Begin trial' })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('sensiviti.v1')!).pending.round),
  ).toBe(1);
});
test('complete result saves, activates, restores, and exposes all seven comparisons', async ({
  page,
}) => {
  const session = completed();
  await seed(page, { ...initialState(), setup: defaultSetup, pending: session });
  await page.goto('/');
  await page.getByRole('button', { name: 'View results' }).click();
  await expect(page.getByRole('heading', { name: 'Meet your next sensitivity.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all seven comparisons' }).click();
  await expect(page.locator('.round-row')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/result.png', fullPage: true });
  await page.getByRole('button', { name: 'Save & activate recommendation' }).click();
  await expect(page.getByText('PROFILE CALIBRATED', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('PROFILE CALIBRATED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Session history' }).click();
  await expect(page.locator('.history-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Review', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Activate this result' })).toBeVisible();
});
test('arena pauses without committing a partial trial, then restarts and auto-advances', async ({
  page,
}) => {
  await seed(page, {
    ...initialState(),
    setup: defaultSetup,
    pending: createSession(defaultSetup),
  });
  // Simulates the host input grant only. Physical raw mouse input is verified separately in Electron.
  await page.addInitScript(() => {
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => locked,
    });
    HTMLElement.prototype.requestPointerLock = async function () {
      locked = this;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    document.exitPointerLock = () => {
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume session' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.clock.install();
  await page.getByRole('button', { name: 'Begin trial' }).click();
  await advanceTrial(page, 3500);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sensiviti.v1')!).pending.trials.length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Restart trial' }).click();
  await advanceTrial(page, 12400);
  await expect(page.locator('.trainer-toolbar h3')).toHaveText('ADS tracking');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sensiviti.v1')!).pending.trials.length,
    ),
  ).toBe(1);
});
test('layout fits a compact desktop viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start with what you know.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/compact-setup.png', fullPage: true });
});

test('backup export/import validates before replacing data and can be cancelled', async ({
  page,
}) => {
  await seed(page, { ...initialState(), setup: defaultSetup });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('sensiviti-backup.json');
  async function choose(content: unknown) {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import backup', exact: true }).click();
    await (
      await chooserPromise
    ).setFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(content)),
    });
  }
  const incoming = { ...initialState(), setup: { ...defaultSetup, dpi: 1600 } };
  await choose(incoming);
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.device-badge')).toContainText('800');
  await choose(incoming);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.device-badge')).toContainText('1600');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await choose({ ...incoming, version: 999 });
  await expect(page.getByRole('alert')).toContainText('not a supported Sensiviti');
  await expect(page.locator('.device-badge')).toContainText('1600');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('snap trainer registers a hit and a miss and reports the measured result', async ({
  page,
}) => {
  await seed(page, { ...initialState(), setup: defaultSetup });
  await page.addInitScript(() => {
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => locked,
    });
    HTMLElement.prototype.requestPointerLock = async function () {
      locked = this;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    document.exitPointerLock = () => {
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice range', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice' }).nth(2).click();
  await page.clock.install();
  await page.getByRole('button', { name: 'Begin trial' }).click();
  await advanceTrial(page, 2200);
  const target = snapPosition(0, 779);
  await page.evaluate(({ yaw, pitch }) => {
    const move = new MouseEvent('mousemove');
    Object.defineProperties(move, {
      movementX: { value: yaw / 0.022 },
      movementY: { value: -pitch / 0.022 },
    });
    document.dispatchEvent(move);
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  }, target);
  await advanceTrial(page, 31000);
  await expect(page.getByText('PRACTICE COMPLETE', { exact: true })).toBeVisible();
  await expect(page.locator('.practice-numbers')).toContainText('50.0%');
  await expect(page.locator('.practice-numbers')).toContainText('1targets hit');
  await expect(page.getByText(/1 misses/)).toBeVisible();
});
