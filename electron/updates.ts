import { z } from 'zod';
import type { UpdateEdition, UpdateStatus } from '../src/core/updates';

const repository = 'https://github.com/Malasuerte94/sensiviti';
export const latestReleaseEndpoint =
  'https://api.github.com/repos/Malasuerte94/sensiviti/releases/latest';
const stableVersion = /^(0|[1-9]\d{0,6})\.(0|[1-9]\d{0,6})\.(0|[1-9]\d{0,6})$/;
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
  assets: z.array(
    z.object({
      name: z.string(),
      state: z.string(),
      size: z.number().int().nonnegative(),
      browser_download_url: z.string(),
    }),
  ),
});

export function isNewerVersion(candidate: string, current: string): boolean {
  if (!stableVersion.test(candidate) || !stableVersion.test(current))
    throw new Error('Unrecognized release version.');
  const next = candidate.split('.').map(Number);
  const installed = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== installed[i]) return next[i] > installed[i];
  }
  return false;
}

export function selectUpdate(input: unknown, current: string, edition: UpdateEdition) {
  const release = releaseSchema.parse(input);
  if (!release.tag_name.startsWith('v')) throw new Error('Invalid release tag.');
  const version = release.tag_name.slice(1);
  if (!isNewerVersion(version, current)) return null;
  const name = `Sensiviti-${version}-${edition === 'portable' ? 'portable' : 'setup'}.exe`;
  const url = `${repository}/releases/download/v${version}/${name}`;
  const asset = release.assets.find((asset) => asset.name === name);
  if (
    !asset ||
    asset.state !== 'uploaded' ||
    asset.size < 1024 * 1024 ||
    asset.browser_download_url !== url
  )
    throw new Error('This release does not have a ready Windows download. Try again later.');
  // Neither arbitrary URLs nor release-note HTML cross the desktop bridge.
  return { version, url };
}

export async function fetchLatestRelease(signal: AbortSignal): Promise<unknown> {
  const response = await fetch(latestReleaseEndpoint, {
    signal,
    redirect: 'error',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sensiviti-update-check' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 403 || response.status === 429)
      throw new Error('Update checks are temporarily limited. Try again later.');
    throw new Error('Could not check for updates. Check your connection and try again.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty release response.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('Release response is too large.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class UpdateController {
  private value: UpdateStatus;
  private release: { version: string; url: string } | null = null;
  private pending: Promise<UpdateStatus> | null = null;
  private abort: AbortController | null = null;
  private lastAttempt = -Infinity;
  private startup?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(
    currentVersion: string,
    edition: UpdateEdition,
    private readonly notify: (state: UpdateStatus) => void,
    private readonly openExternal: (url: string) => Promise<unknown>,
    private readonly fetchRelease = fetchLatestRelease,
  ) {
    this.value = { currentVersion, edition, phase: 'idle', checkedAt: null };
  }

  status(): UpdateStatus {
    return { ...this.value };
  }

  start() {
    if (this.disposed || this.startup || this.interval) return;
    this.startup = setTimeout(() => void this.check(), 10_000);
    this.interval = setInterval(() => void this.check(), 6 * 60 * 60 * 1000);
  }

  check(): Promise<UpdateStatus> {
    if (this.pending) return this.pending;
    if (this.disposed || Date.now() - this.lastAttempt < 60_000)
      return Promise.resolve(this.status());
    this.lastAttempt = Date.now();
    this.set({ ...this.value, phase: 'checking', message: undefined });
    this.pending = this.performCheck().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async performCheck(): Promise<UpdateStatus> {
    const abort = new AbortController();
    this.abort = abort;
    const timeout = setTimeout(() => abort.abort(), 12_000);
    try {
      const input = await this.fetchRelease(abort.signal);
      if (this.disposed) return this.status();
      this.release = selectUpdate(input, this.value.currentVersion, this.value.edition);
      this.set({
        ...this.value,
        phase: this.release ? 'available' : 'current',
        release: this.release ? { version: this.release.version } : undefined,
        checkedAt: Date.now(),
        message: undefined,
      });
    } catch (error) {
      if (!this.disposed)
        this.set({
          ...this.value,
          phase: 'error',
          message:
            error instanceof Error && !abort.signal.aborted && !(error instanceof z.ZodError)
              ? error.message
              : 'Could not check for updates. Check your connection and try again.',
        });
    } finally {
      clearTimeout(timeout);
      this.abort = null;
    }
    return this.status();
  }

  async download(): Promise<void> {
    if (!this.release || this.disposed) throw new Error('Check for an available update first.');
    await this.openExternal(this.release.url);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.startup);
    clearInterval(this.interval);
    this.abort?.abort();
  }

  private set(state: UpdateStatus) {
    this.value = state;
    this.notify(this.status());
  }
}
