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

### New in 1.2.0

- Mouse settings with current DPI, quick presets, and automatic conversion that preserves physical turn distance.
- Library, custom games, practice, result views, and resumed calibration all use the current mouse DPI.
- Correct an incorrectly entered test DPI without rewriting its historical trials, scores, or decisions.
- Optional ruler-based DPI estimate using unadjusted mouse input. Manual entry remains available; this is not universal hardware auto-detection.
- Saved profiles and JSON backups from 1.0.0 and 1.1.0 remain supported, including unfinished calibrations.
- Permanent saved-data compatibility requirements in AGENTS.md, with immutable synthetic profile fixtures and regression checks.

### Included

- Automatic seven-round PSA calibration with optional player overrides.
- Smooth tracking, ADS tracking, and snap aiming, plus free practice.
- Hipfire sensitivity conversions for 13 presets and your custom library.
- Add, edit, and remove up to 100 custom game profiles.
- Saved results, session resume, and JSON backup import/export.
- Automatic profile loading on every launch from %APPDATA%/Sensiviti/sensiviti.json. Installer and portable share this location.
- Settings shows the saved-data path and can open its folder.

MIT licensed. No account or network connection required to use the app.

The executables are unsigned; Windows may display an unknown-publisher prompt. Profiles are preserved across updates and ordinary uninstallation.
`,
);
console.log(`Release ${version}: both Windows executables and checksums verified.`);
