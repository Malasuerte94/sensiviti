import { _electron as electron, expect } from '@playwright/test';
import electronPath from 'electron';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
await mkdir(path.join(root, '.sensiviti-test'), { recursive: true });
const testRoot = await mkdtemp(path.join(root, '.sensiviti-test/startup-'));
const compiled = await build({
  stdin: {
    contents: `export * from './src/core/calibration'; export * from './src/core/schema'; export * from './src/core/games';`,
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const core = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const existingIndex = process.argv.indexOf('--existing-profile');
const existing = existingIndex >= 0 ? path.resolve(process.argv[existingIndex + 1]) : null;
const originalBytes = existing ? await readFile(existing) : null;
let completed = core.createSession(core.defaultSetup);
while (completed.phase !== 'complete') {
  if (completed.review) {
    completed = core.commitDecision(completed);
    continue;
  }
  const task = core.getTask(completed);
  const score = ['higher', 'result'].includes(task.candidate) ? 0.8 : 0.4;
  completed = core.recordTrial(completed, task, {
    duration: task.duration,
    onTargetSeconds: score * task.duration,
    meanAngularError: 2,
    shots: 10,
    hits: 5,
    acquisitionTimes: [0.5],
    score,
  });
}
const fixture = {
  ...core.initialState(),
  setup: core.defaultSetup,
  games: core.gameIds,
  customGames: [
    {
      id: 'd713ca89-9335-4409-856b-4cda7bbf9c87',
      name: 'My custom shooter',
      scale: 'linear',
      yaw: 0.022,
    },
    { id: 'e713ca89-9335-4409-856b-4cda7bbf9c87', name: 'My FPP profile', scale: 'pubg' },
  ],
  activeResultId: completed.id,
  sessions: [
    {
      id: completed.id,
      createdAt: completed.createdAt,
      setup: completed.setup,
      angular: completed.result.angular,
      validated: completed.result.validated,
      session: completed,
    },
  ],
};

async function runCase(name, bytes, inspect) {
  const appData = path.join(testRoot, name);
  const profile = path.join(appData, 'Sensiviti');
  await mkdir(profile, { recursive: true });
  const file = path.join(profile, 'sensiviti.json');
  if (bytes) await writeFile(file, bytes);
  const bootstrap = path.join(testRoot, `${name}.cjs`);
  // Change Electron's appData source, not the application's custom-profile override.
  // This tests the real default-path branch without touching the user's profile.
  await writeFile(
    bootstrap,
    `const { app } = require('electron'); app.setPath('appData', ${JSON.stringify(appData)}); require(${JSON.stringify(path.join(root, 'dist-electron/main.cjs'))});`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SENSIVITI_DATA_DIR;
  delete env.SENSIVITI_DEV_URL;
  const desktop = await electron.launch({
    executablePath: electronPath,
    args: [bootstrap],
    env,
    timeout: 30000,
  });
  try {
    const page = await desktop.firstWindow();
    await inspect(page, desktop, file);
    const location = await page.evaluate(() => window.sensiviti.profileInfo());
    expect(location.file).toBe(file);
    if (bytes) expect(hash(await readFile(file))).toBe(hash(bytes));
    else await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await desktop.close();
  }
  return { profile, file, bootstrap, env };
}
await runCase('missing', null, async (page) => {
  await expect(page.getByRole('heading', { name: 'Start with what you know.' })).toBeVisible();
});
const validBytes = originalBytes ?? Buffer.from(JSON.stringify(fixture));
const expected = core.parseState(JSON.parse(validBytes.toString()));
const valid = await runCase('saved', validBytes, async (page) => {
  await expect(page.getByRole('heading', { name: 'Your aim, in focus' })).toBeVisible();
  const loaded = await page.evaluate(() => window.sensiviti.load());
  expect(loaded).toEqual(expected);
  if (expected.activeResultId)
    await expect(page.getByText('PROFILE CALIBRATED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.profile-location code')).toContainText('sensiviti.json');
});
const restarted = await electron.launch({
  executablePath: electronPath,
  args: [valid.bootstrap],
  env: valid.env,
  timeout: 30000,
});
try {
  const page = await restarted.firstWindow();
  await expect(page.getByRole('heading', { name: 'Your aim, in focus' })).toBeVisible();
  expect(await page.evaluate(() => window.sensiviti.load())).toEqual(expected);
  expect(hash(await readFile(valid.file))).toBe(hash(validBytes));
} finally {
  await restarted.close();
}
const pending = {
  ...core.initialState(),
  setup: core.defaultSetup,
  pending: core.createSession(core.defaultSetup),
};
// A profile written by 1.0.0 has no customGames field. Loading must not rewrite it.
const { customGames: _customGames, ...legacy } = pending;
await runCase('legacy-v1', Buffer.from(JSON.stringify(legacy)), async (page) => {
  await expect(page.getByRole('button', { name: 'Resume session' })).toBeVisible();
  expect((await page.evaluate(() => window.sensiviti.load())).customGames).toEqual([]);
});
await runCase('pending', Buffer.from(JSON.stringify(pending)), async (page) => {
  await expect(page.getByRole('button', { name: 'Resume session' })).toBeVisible();
});
await runCase('corrupt', Buffer.from('{incomplete json'), async (page) => {
  await expect(
    page.getByRole('heading', { name: 'Your saved file needs attention.' }),
  ).toBeVisible();
});
if (existing) expect(hash(await readFile(existing))).toBe(hash(originalBytes));
console.log(
  `Startup smoke passed: default path, saved profile, real process restart, resumable session, first run, and corrupt-file preservation.${existing ? ' Existing user profile validated on an isolated copy; original unchanged.' : ''}`,
);
