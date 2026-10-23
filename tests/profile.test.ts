import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { profileDirectory } from '../electron/profile';

describe('persistent profile location', () => {
  it('uses the same default independently of executable, installation, or working directory', () => {
    const appData = path.resolve('example-roaming');
    expect(profileDirectory(appData)).toBe(path.join(appData, 'Sensiviti'));
    expect(profileDirectory(appData, '')).toBe(path.join(appData, 'Sensiviti'));
  });
  it('honors only an explicit custom-profile override', () => {
    expect(profileDirectory(path.resolve('example-roaming'), 'custom-profile')).toBe(
      path.resolve('custom-profile'),
    );
  });
});
