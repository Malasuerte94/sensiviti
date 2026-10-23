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

### Included

- Automatic seven-round PSA calibration with optional player overrides.
- Smooth tracking, ADS tracking, and snap aiming, plus free practice.
- CS2, Apex Legends, and Minecraft Java sensitivity conversions.
- Saved results, session resume, and JSON backup import/export.
- Automatic profile loading on every launch from %APPDATA%/Sensiviti/sensiviti.json. Installer and portable share this location.
- Settings shows the saved-data path and can open its folder.

MIT licensed. No account or network connection required to use the app.

The executables are unsigned; Windows may display an unknown-publisher prompt. Profiles are preserved across updates and ordinary uninstallation.
`,
);
console.log(`Release ${version}: both Windows executables and checksums verified.`);
