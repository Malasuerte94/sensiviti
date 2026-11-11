import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
if (process.platform !== 'win32') throw new Error('Native capture checks require Windows.');
await mkdir('.sensiviti-test/native', { recursive: true });
const executable = path.resolve('.sensiviti-test/native/turn-capture-smoke.exe');
const compiler = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
);
execFileSync(
  compiler,
  [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/main:TurnCaptureSmoke',
    '/reference:System.Windows.Forms.dll',
    `/out:${executable}`,
    path.resolve('native/TurnCapture.cs'),
    path.resolve('tests/native/TurnCaptureSmoke.cs'),
  ],
  { stdio: 'inherit', windowsHide: true },
);
execFileSync(executable, [], { stdio: 'inherit', windowsHide: true, timeout: 15000 });
