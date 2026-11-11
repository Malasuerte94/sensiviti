import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLatestRelease,
  isNewerVersion,
  selectUpdate,
  UpdateController,
} from '../electron/updates';
import type { UpdateStatus } from '../src/core/updates';

function release(version = '1.5.0') {
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    assets: ['setup', 'portable'].map((edition) => ({
      name: `Sensiviti-${version}-${edition}.exe`,
      state: 'uploaded',
      size: 100_000_000,
      browser_download_url: `https://github.com/Malasuerte94/sensiviti/releases/download/v${version}/Sensiviti-${version}-${edition}.exe`,
    })),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('published Windows releases', () => {
  it('compares numeric versions without downgrading or accepting prereleases', () => {
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true);
    expect(isNewerVersion('1.4.0', '1.4.0')).toBe(false);
    expect(isNewerVersion('1.3.9', '1.4.0')).toBe(false);
    for (const version of ['1.5.0-beta', '01.5.0', 'v1.5.0', '1.5', '../../evil'])
      expect(() => isNewerVersion(version, '1.4.0')).toThrow();
  });
  it('selects the matching edition and ignores older/equal public versions', () => {
    expect(selectUpdate(release(), '1.4.0', 'installer')?.url).toContain('-setup.exe');
    expect(selectUpdate(release(), '1.4.0', 'portable')?.url).toContain('-portable.exe');
    expect(selectUpdate(release('1.3.0'), '1.4.0', 'portable')).toBeNull();
    expect(selectUpdate(release('1.4.0'), '1.4.0', 'portable')).toBeNull();
  });
  it('rejects drafts, prereleases, incomplete assets and non-repository downloads', () => {
    const good = release();
    for (const invalid of [
      { ...good, draft: true },
      { ...good, prerelease: true },
      { ...good, assets: [] },
      ...[
        'https://evil.test/update.exe',
        'file:///update.exe',
        good.assets[0].browser_download_url + '?redirect=evil',
      ].map((url) => ({ ...good, assets: [{ ...good.assets[0], browser_download_url: url }] })),
      { ...good, assets: [{ ...good.assets[0], state: 'new' }] },
      { ...good, assets: [{ ...good.assets[0], size: 12 }] },
    ])
      expect(() => selectUpdate(invalid, '1.4.0', 'installer')).toThrow();
  });
});

describe('update controller', () => {
  it('checks automatically after startup and periodically, without downloading', async () => {
    vi.useFakeTimers();
    const fetchRelease = vi.fn().mockResolvedValue(release());
    const open = vi.fn().mockResolvedValue(undefined);
    const events: UpdateStatus[] = [];
    const updater = new UpdateController(
      '1.4.0',
      'portable',
      (event) => events.push(event),
      open,
      fetchRelease,
    );
    updater.start();
    updater.start();
    expect(fetchRelease).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchRelease).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ phase: 'available', release: { version: '1.5.0' } });
    expect(open).not.toHaveBeenCalled();
    await updater.download();
    expect(open).toHaveBeenCalledWith(release().assets[1].browser_download_url);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(fetchRelease).toHaveBeenCalledTimes(2);
    updater.dispose();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(fetchRelease).toHaveBeenCalledTimes(2);
  });
  it('coalesces requests, limits retries, and recovers after offline failure', async () => {
    vi.useFakeTimers();
    let fail!: (reason: Error) => void;
    const fetchRelease = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValue(release('1.4.0'));
    const updater = new UpdateController('1.4.0', 'installer', () => {}, vi.fn(), fetchRelease);
    const first = updater.check();
    expect(updater.check()).toBe(first);
    fail(new Error('Offline'));
    expect(await first).toMatchObject({ phase: 'error', checkedAt: null });
    await updater.check();
    expect(fetchRelease).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await updater.check()).toMatchObject({ phase: 'current', release: undefined });
    await expect(updater.download()).rejects.toThrow('available update');
    updater.dispose();
  });
  it('aborts slow requests and disposes without late notifications', async () => {
    vi.useFakeTimers();
    const receive = vi.fn();
    const fetchRelease = (signal: AbortSignal) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }),
      );
    const updater = new UpdateController('1.4.0', 'portable', receive, vi.fn(), fetchRelease);
    const first = updater.check();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await first).toMatchObject({
      phase: 'error',
      message: expect.stringContaining('connection'),
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const second = updater.check();
    const count = receive.mock.calls.length;
    updater.dispose();
    await second;
    expect(receive).toHaveBeenCalledTimes(count);
  });
  it('keeps a known download through an offline check, then clears a withdrawn release', async () => {
    vi.useFakeTimers();
    const fetchRelease = vi
      .fn()
      .mockResolvedValueOnce(release())
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(release('1.4.0'));
    const updater = new UpdateController('1.4.0', 'installer', () => {}, vi.fn(), fetchRelease);
    await updater.check();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await updater.check()).toMatchObject({ phase: 'error', release: { version: '1.5.0' } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await updater.check()).toMatchObject({ phase: 'current', release: undefined });
    await expect(updater.download()).rejects.toThrow();
    updater.dispose();
  });
});

describe('public release transport', () => {
  it('requests only public metadata, with cancellation and no redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(release())));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await fetchLatestRelease(signal)).toEqual(release());
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/Malasuerte94/sensiviti/releases/latest',
      {
        signal,
        redirect: 'error',
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sensiviti-update-check' },
      },
    );
  });
  it('handles rate limits and rejects oversized or malformed responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response('x'.repeat(1024 * 1024 + 1)))
      .mockResolvedValueOnce(new Response('not json'));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await expect(fetchLatestRelease(signal)).rejects.toThrow('temporarily limited');
    await expect(fetchLatestRelease(signal)).rejects.toThrow('too large');
    await expect(fetchLatestRelease(signal)).rejects.toThrow();
  });
});
