import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function buildNative() {
  if (process.platform !== 'win32') return;
  const compiler = path.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'Microsoft.NET',
    'Framework64',
    'v4.0.30319',
    'csc.exe',
  );
  await mkdir('dist-electron/native', { recursive: true });
  execFileSync(
    compiler,
    [
      '/nologo',
      '/target:exe',
      '/platform:x64',
      '/optimize+',
      '/reference:System.Windows.Forms.dll',
      `/out:${path.resolve('dist-electron/native/turn-capture.exe')}`,
      path.resolve('native/TurnCapture.cs'),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
}
