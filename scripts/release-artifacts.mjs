import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_REF_TYPE === 'tag' && tag !== `v${version}`)
  throw new Error(`Release tag ${tag} does not match package version v${version}.`);
const names = [`Sensiviti-${version}-setup.exe`, `Sensiviti-${version}-portable.exe`];
const sums = [];
for (const name of names) {
  const bytes = await readFile(`release/${name}`);
  if (bytes.length < 1024 * 1024) throw new Error(`Invalid executable: ${name}`);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
await writeFile('release/SHA256SUMS.txt', sums.join('\n') + '\n');
await writeFile(
  'release/RELEASE_NOTES.md',
  `## Sensiviti ${version}

Offline mouse-sensitivity calibration and 3D aim training for Windows x64.

### Downloads

- **Sensiviti-${version}-setup.exe** — guided Windows installer.
- **Sensiviti-${version}-portable.exe** — run without installation.
- **SHA256SUMS.txt** — SHA-256 checksums for both executables.

### New in 1.3.0

- Measure a custom game's cm/360 without a ruler: enter your current DPI and in-game sensitivity, arm measurement, then mark three full turns in that game with F11.
- Automatically fills the median distance when the three turns agree within 5%. Add to library saves the existing linear custom profile.
- Counts horizontal raw mouse movement in the background. Up-down drift is ignored and left-right corrections cancel out; the camera remains under your control.
- Audible start/stop cues, cancellation, focus-loss detection, single-mouse validation, and automatic timeouts. F11 is released when capture ends.
- Passive Windows receiver: no input injection, game-memory access, or automatic changes to game settings. Keep acceleration off and FOV/multipliers unchanged; unknown nonlinear scales still need a supported formula.
- Preserves profiles and JSON backups from 1.0.0, 1.1.0 and 1.2.0, including completed tests, custom games, DPI corrections and unfinished calibrations. No storage-format change.

### Included

- Automatic seven-round PSA calibration with optional player overrides.
- Smooth tracking, ADS tracking, and snap aiming, plus free practice.
- Hipfire sensitivity conversions for 13 presets and your custom library.
- Add, edit, and remove up to 100 custom game profiles.
- Windows in-game turn measurement: arm capture, mark three full turns with F11, and fill cm/360 without a ruler. Uses horizontal raw mouse counts and preserves existing profiles.
- Saved results, session resume, and JSON backup import/export.
- Automatic profile loading on every launch from %APPDATA%/Sensiviti/sensiviti.json. Installer and portable share this location.
- Settings shows the saved-data path and can open its folder.

MIT licensed. No account or network connection required to use the app.

The executables are unsigned; Windows may display an unknown-publisher prompt. Profiles are preserved across updates and ordinary uninstallation.
`,
);
console.log(`Release ${version}: both Windows executables and checksums verified.`);
