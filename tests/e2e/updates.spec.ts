import { expect, test, type Page } from '@playwright/test';
import { parseState } from '../../src/core/schema';
import legacy from '../fixtures/profiles/v1.2.0.json' with { type: 'json' };
import type { UpdateEdition, UpdateStatus } from '../../src/core/updates';

async function prepare(page: Page, edition: UpdateEdition, available = true) {
  await page.addInitScript(
    ({ state, edition, available }) => {
      localStorage.setItem('sensiviti.v1', JSON.stringify(state));
      let update: UpdateStatus = {
        currentVersion: '1.4.0',
        edition,
        phase: available ? 'available' : 'idle',
        checkedAt: available ? Date.now() : null,
        release: available ? { version: '1.5.0' } : undefined,
      };
      let checks = 0;
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
        updates: {
          status: async () => update,
          check: async () => {
            checks++;
            update = { ...update, phase: 'checking' };
            window.dispatchEvent(new CustomEvent('test:update', { detail: update }));
            await new Promise((resolve) => setTimeout(resolve, 200));
            update =
              checks === 1
                ? {
                    ...update,
                    phase: 'error',
                    message: 'Could not check for updates. Check your connection and try again.',
                  }
                : {
                    ...update,
                    phase: 'current',
                    checkedAt: Date.now(),
                    message: undefined,
                    release: undefined,
                  };
            window.dispatchEvent(new CustomEvent('test:update', { detail: update }));
            return update;
          },
          download: async () => {
            document.documentElement.dataset.downloadedEdition = edition;
          },
          subscribe: (listener) => {
            const receive = (event: Event) => listener((event as CustomEvent).detail);
            window.addEventListener('test:update', receive);
            return () => window.removeEventListener('test:update', receive);
          },
        },
      };
    },
    { state: parseState(legacy), edition, available },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your aim, in focus' })).toBeVisible();
}

for (const edition of ['installer', 'portable'] as const) {
  test(`${edition}: announces an update and opens the matching download without changing the profile`, async ({
    page,
  }) => {
    await prepare(page, edition);
    const before = await page.evaluate(() => localStorage.getItem('sensiviti.v1'));
    await expect(page.getByText('Sensiviti 1.5.0 is available', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Download ${edition}`, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-downloaded-edition', edition);
    await page.getByRole('button', { name: 'Dismiss update notification' }).click();
    await expect(page.locator('.update-notice')).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'App updates' })).toBeVisible();
    await expect(page.getByText('Sensiviti 1.5.0 is available.', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Download ${edition}`, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sensiviti.v1'))).toBe(before);
    await page.setViewportSize({ width: 1000, height: 720 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (edition === 'portable')
      await page.screenshot({ path: 'test-results/updates-settings.png', fullPage: true });
  });
}
test('offline checks are recoverable and keep normal use available', async ({ page }) => {
  await prepare(page, 'portable', false);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
  await expect(
    page.getByText('Could not check for updates. Check your connection and try again.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('You’re up to date.')).toBeVisible();
  await page.getByRole('button', { name: 'My games' }).click();
  await expect(page.getByRole('button', { name: 'Add custom game', exact: true })).toBeVisible();
});
test('automatic notifications stay out of practice and appear on return', async ({ page }) => {
  await prepare(page, 'portable', false);
  await page.getByRole('button', { name: 'Practice range', exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test:update', {
        detail: {
          currentVersion: '1.4.0',
          edition: 'portable',
          phase: 'available',
          checkedAt: Date.now(),
          release: { version: '1.5.0' },
        },
      }),
    ),
  );
  await expect(page.locator('.update-notice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Sensiviti 1.5.0 is available', { exact: true })).toBeVisible();
});
