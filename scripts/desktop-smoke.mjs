import { _electron as electron, chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
await mkdir(path.join(root, '.sensiviti-test'), { recursive: true });
const profile = await mkdtemp(path.join(root, '.sensiviti-test', 'desktop-'));
const env = { ...process.env, SENSIVITI_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
// NSIS doesn't forward the child inspector's stderr. Attach to the actual portable
// application's Chromium endpoint instead of waiting for an inspector URL on the wrapper.
async function launchPortable() {
  const child = spawn(
    path.join(root, 'release', 'Sensiviti-1.0.0-portable.exe'),
    ['--remote-debugging-port=0'],
    { env, windowsHide: true, stdio: 'ignore' },
  );
  let port = '';
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0];
      if (port) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!port) {
    child.kill();
    throw new Error('Portable application did not expose its test endpoint.');
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  return {
    firstWindow: async () => browser.contexts()[0].pages()[0],
    close: async () => {
      for (const page of browser.contexts()[0].pages()) await page.close();
      await browser.close();
    },
  };
}
const desktop = packaged
  ? await launchPortable()
  : await electron.launch({ executablePath: electronPath, args: ['.'], env, timeout: 30000 });
try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start with what you know.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Save & explore' }).click();
  await expect(page.getByRole('heading', { name: 'Your aim, in focus' })).toBeVisible();
  const state = JSON.parse(await readFile(path.join(profile, 'sensiviti.json'), 'utf8'));
  expect(state.setup.dpi).toBe(800);
  if (!packaged) {
    // Stub native dialog choices; IPC, validation, and file I/O remain real.
    const backupPath = path.join(profile, 'backup.json');
    await desktop.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, backupPath);
    expect(await page.evaluate(() => window.sensiviti.exportBackup())).toBe(true);
    expect(JSON.parse(await readFile(backupPath, 'utf8')).setup.dpi).toBe(800);
    await desktop.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, backupPath);
    expect((await page.evaluate(() => window.sensiviti.importBackup())).setup.dpi).toBe(800);
  }
  await page.getByRole('button', { name: 'Practice range', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice' }).first().click();
  await expect(page.locator('canvas')).toBeVisible();
  if (!packaged)
    await desktop.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.show();
      win.focus();
      win.webContents.focus();
    });
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  await page.getByRole('button', { name: 'Begin trial' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.waitForTimeout(2400);
  await expect(page.locator('.arena-overlay')).toHaveCount(0);
  await page.mouse.move(20, 20);
  await page.mouse.move(200, 300);
  await page.screenshot({ path: 'test-results/desktop-arena.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave trainer' }).click();
  if (!packaged) {
    const sandbox = await desktop.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const p = w.webContents.getLastWebPreferences();
      return { sandbox: p.sandbox, isolated: p.contextIsolation, node: p.nodeIntegration };
    });
    expect(sandbox).toEqual({ sandbox: true, isolated: true, node: false });
  }
  expect(await page.evaluate(() => typeof window.sensiviti.load)).toBe('function');
  expect(await page.evaluate(() => typeof window.process)).toBe('undefined');
  expect(errors).toEqual([]);
  console.log(
    `${packaged ? 'Portable executable' : 'Desktop'} smoke passed: native IPC persistence, offline renderer, Three.js, real unadjusted pointer lock, and pause.${packaged ? '' : ' Native export/import and sandbox also verified.'}`,
  );
} catch (error) {
  const page = await desktop.firstWindow();
  await page.screenshot({ path: 'test-results/desktop-failure.png' }).catch(() => {});
  console.error(
    'Desktop diagnostic:',
    await page
      .locator('.arena-dialog')
      .innerText()
      .catch(() => page.locator('body').innerText()),
  );
  throw error;
} finally {
  await desktop.close();
}
