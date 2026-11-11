import { expect, test, type Page } from '@playwright/test';
import { parseState } from '../../src/core/schema';
import legacy from '../fixtures/profiles/v1.2.0.json' with { type: 'json' };
import type { TurnCaptureEvent } from '../../src/core/turnMeasurement';

async function prepare(page: Page, desktop = true) {
  await page.addInitScript(
    ({ state, desktop }) => {
      if (!localStorage.getItem('turn-seeded')) {
        localStorage.setItem('sensiviti.v1', JSON.stringify(state));
        localStorage.setItem('turn-seeded', 'yes');
      }
      if (!desktop) return;
      // Only the native transport is mocked here. Registration and helper lifecycle
      // are exercised by test:native and test:startup on Windows.
      window.sensiviti = {
        load: async () => JSON.parse(localStorage.getItem('sensiviti.v1')!),
        save: async (value) => {
          localStorage.setItem('sensiviti.v1', JSON.stringify(value));
        },
        profileInfo: async () => ({ directory: 'test', file: 'test/sensiviti.json' }),
        openProfileFolder: async () => {},
        exportBackup: async () => true,
        importBackup: async () => null,
        fullscreen: async () => {},
        turnCapture: {
          available: true,
          start: async (request) => {
            document.documentElement.dataset.turnId = request.id;
            window.dispatchEvent(
              new CustomEvent('test:turn', { detail: { id: request.id, type: 'ready' } }),
            );
          },
          cancel: async (id) => {
            document.documentElement.dataset.cancelledTurn = id;
            window.dispatchEvent(
              new CustomEvent('test:turn', { detail: { id, type: 'cancelled' } }),
            );
          },
          subscribe: (listener) => {
            const callback = (event: Event) => listener((event as CustomEvent).detail);
            window.addEventListener('test:turn', callback);
            return () => window.removeEventListener('test:turn', callback);
          },
        },
      };
    },
    { state: parseState(legacy), desktop },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'My games' }).click();
  await page.getByRole('button', { name: 'Add custom game', exact: true }).click();
  await page.getByLabel('Game name', { exact: true }).fill('In-game measured shooter');
  await page.getByLabel('Sensitivity scale', { exact: true }).selectOption('linear');
  await page.getByLabel('Measurement DPI').fill('1600');
  await page.getByLabel('Measured in-game sensitivity').fill('2');
}
async function emit(page: Page, event: Omit<TurnCaptureEvent, 'id'> | Record<string, unknown>) {
  await page.evaluate(
    (event) =>
      window.dispatchEvent(
        new CustomEvent('test:turn', {
          detail: { id: document.documentElement.dataset.turnId, ...event },
        }),
      ),
    event,
  );
}

test('three turns fill cm/360 and save through the existing profile format', async ({ page }) => {
  await prepare(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sensiviti.v1')!));
  await page.getByRole('button', { name: 'Arm in-game measurement' }).click();
  await expect(page.getByText('Ready: 0/3', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Measurement DPI')).toBeDisabled();
  await expect(page.getByLabel('Sensitivity scale', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add to library', exact: true })).toBeDisabled();
  for (let count = 1; count <= 3; count++) {
    await emit(page, { type: 'measuring' });
    await expect(page.getByText(`Recording turn ${count}/3`, { exact: false })).toBeVisible();
    await emit(page, { type: 'sample', count, cm: 25.4 });
  }
  await expect(page.getByLabel('Measured cm/360', { exact: true })).toHaveValue('');
  await emit(page, { type: 'complete', cm: 25.4, spread: 0 });
  await expect(page.getByLabel('Measured cm/360', { exact: true })).toHaveValue('25.4');
  await expect(page.getByText('25.4000 cm/360', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.screenshot({ path: 'test-results/turn-measurement.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'In-game measured shooter', exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sensiviti.v1')!));
  expect(stored.customGames.at(-1).yaw).toBeCloseTo(0.01125);
  expect(stored.version).toBe(1);
  for (const field of ['setup', 'mouseSettings', 'sessions', 'pending', 'activeResultId', 'games'])
    expect(stored[field]).toEqual(before[field]);
});

test('cancel, errors, stale events and navigation cannot apply a partial measurement', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Measured cm/360', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Arm in-game measurement' }).click();
  const oldId = await page.locator('html').getAttribute('data-turn-id');
  await emit(page, { type: 'measuring' });
  await emit(page, { type: 'sample', count: 1, cm: 25.4 });
  await page.getByRole('button', { name: 'Cancel measurement', exact: true }).click();
  await emit(page, { type: 'complete', cm: 25.4, spread: 0 });
  await expect(page.getByLabel('Measured cm/360', { exact: true })).toHaveValue('40');
  await page.getByRole('button', { name: 'Arm in-game measurement' }).click();
  await emit(page, { id: oldId, type: 'complete', cm: 25.4, spread: 0 });
  await expect(page.getByLabel('Measured cm/360', { exact: true })).toHaveValue('40');
  await emit(page, { type: 'error', message: 'The game lost focus. Restart the measurement.' });
  await expect(page.getByRole('alert')).toContainText('lost focus');
  await expect(page.getByLabel('Measurement DPI')).toBeEnabled();
  await page.getByRole('button', { name: 'Arm in-game measurement' }).click();
  const id = await page.locator('html').getAttribute('data-turn-id');
  await page.getByRole('button', { name: 'Close custom game form' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-cancelled-turn', id!);
  await emit(page, { type: 'complete', cm: 25.4, spread: 0 });
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('sensiviti.v1')!))).customGames,
  ).toEqual(legacy.customGames);
});

test('invalid settings do not arm capture and browsers explain desktop availability', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Measurement DPI').fill('0');
  await page.getByRole('button', { name: 'Arm in-game measurement' }).click();
  await expect(page.getByRole('alert')).toContainText('active mouse DPI');
  expect(await page.locator('html').getAttribute('data-turn-id')).toBeNull();
  await page.getByLabel('Measurement DPI').fill('1600');
  await page.getByLabel('Measured in-game sensitivity').fill('0');
  await page.getByRole('button', { name: 'Arm in-game measurement' }).click();
  await expect(page.getByRole('alert')).toContainText('positive in-game sensitivity');
});

test('web users retain manual turn-distance entry', async ({ page }) => {
  await prepare(page, false);
  await expect(
    page.getByText('In-game measurement is available in the Windows desktop app.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arm in-game measurement' })).toHaveCount(0);
  await page.getByLabel('Measured cm/360', { exact: true }).fill('25.4');
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'In-game measured shooter', exact: true }),
  ).toBeVisible();
});
