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

### New in 1.4.0

- Both installed and portable editions automatically check for newer stable releases after startup and every six hours while open.
- A non-blocking update notification offers the correct Windows download. Settings → App updates also shows status, the last successful check, and a manual Check for updates button.
- Downloads open in your browser. Close Sensiviti, then run the new installer or portable file. Installation and executable replacement remain manual; running calibrations are never interrupted.
- Handles offline use, timeouts and rate limits without blocking the app. Requests only public GitHub release information; profiles stay local.
- Preserves profiles and JSON backups from 1.0.0 through 1.3.0, including completed tests, custom games, DPI corrections and unfinished calibrations. No storage-format change.
- Upgrade from 1.3.0 or earlier manually once; those versions do not contain the update checker.

### Included

- Automatic seven-round PSA calibration with optional player overrides.
- Smooth tracking, ADS tracking, and snap aiming, plus free practice.
- Hipfire sensitivity conversions for 13 presets and your custom library.
- Add, edit, and remove up to 100 custom game profiles.
- Windows in-game turn measurement: arm capture, mark three full turns with F11, and fill cm/360 without a ruler. Uses horizontal raw mouse counts and preserves existing profiles.
- Saved results, session resume, and JSON backup import/export.
- Automatic profile loading on every launch from %APPDATA%/Sensiviti/sensiviti.json. Installer and portable share this location.
- Settings shows the saved-data path and can open its folder.
- Automatic release checks and matching installer/portable download notifications.

MIT licensed. No account or network connection required to use the app.

The executables are unsigned; Windows may display an unknown-publisher prompt. Profiles are preserved across updates and ordinary uninstallation.
`,
);
console.log(`Release ${version}: both Windows executables and checksums verified.`);
