# Sensiviti

[![Checks](https://github.com/Malasuerte94/sensiviti/actions/workflows/ci.yml/badge.svg)](https://github.com/Malasuerte94/sensiviti/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-76e5d6)](LICENSE)

[Download the latest release](https://github.com/Malasuerte94/sensiviti/releases/latest) · [Report an issue](https://github.com/Malasuerte94/sensiviti/issues) · [Contribute](CONTRIBUTING.md)

An offline Windows sensitivity finder and 3D aim trainer. Seven score-guided PSA comparisons, three equally weighted drills, and a final comparison against your original setting. Built with Electron, React, TypeScript, Vite, and Three.js.

## Run the app

Download **Sensiviti-1.2.0-setup.exe** for a guided installation, or **Sensiviti-1.2.0-portable.exe** to run without installation, from the [Releases page](https://github.com/Malasuerte94/sensiviti/releases). Both target Windows x64 and include their runtime; a separately installed Node.js is not required. SHA-256 checksums are provided with each release.

Every launch automatically checks `%APPDATA%\Sensiviti\sensiviti.json` and loads your saved setup, active recommendation, session history, and unfinished calibration. The installer and portable app share the same profile. Updates and ordinary uninstallation preserve it. **Settings → Keep your progress** shows the exact file location and provides **Open saved-data folder**.

Only a genuinely new profile opens the setup wizard. Select your reference game, mouse DPI, and starting sensitivity, then start calibration or save your setup and explore. A damaged profile produces a recovery screen; it is never silently overwritten with defaults.

Calibration applies sensitivity inside the trainer. **My games** offers 13 presets: CS2, Apex Legends, Minecraft Java, Battlefield 6, PUBG, Modern Warfare (2019), Warzone, VALORANT, Overwatch 2, Fortnite, Rainbow Six Siege, Destiny 2, and THE FINALS. Select any combination for your library and copy settings into your games. The app does not change game files or system mouse settings.

Use **Add custom game** to save up to 100 additional entries. Choose an existing sensitivity scale, or define a linear scale from your measured in-game sensitivity, mouse DPI, and cm/360. Custom entries can be edited or removed independently and appear on Overview and calibration results. Libraries are included in backups and loaded automatically. Existing 1.0.0 profiles retain their setup, results, and progress.

**Settings → Mouse settings** stores your current hardware DPI independently of saved tests. After changing DPI on the mouse itself, update it here: all game conversions, practice, saved-result views, and resumed calibration trials preserve physical cm/360 automatically. At 800 → 1600 DPI, CS2 sensitivity 1 becomes 0.5; nonlinear game sliders are converted through angular units. This does not program the mouse or change Windows cursor settings.

If a test was completed with the wrong DPI number entered, expand **Correct a test’s recorded DPI**, choose the test, and enter the actual hardware DPI used throughout it. The correction is stored as separate metadata; historical setup, trials, scores, and decisions remain intact. Choose whether to use that number as your current DPI too. This fixes the attributed cm/360 without repeating a valid test. Changing hardware DPI partway through a test without conversion requires a fresh calibration.

There is no universal hardware-DPI auto-detection in the app. Windows' [standard mouse device info](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rid_device_info_mouse) exposes no current DPI setting. Prefer the DPI shown in your mouse software. **Estimate DPI with a ruler** measures unadjusted horizontal counts over a distance you specify: click Start measurement, move straight along that distance, and press Space to finish; Esc cancels. The result is an estimate and is applied only after **Use estimated DPI → Update mouse DPI**. If raw input is unavailable, use manual entry; accelerated input is never used as a substitute.

Compatibility with earlier profiles and backups is mandatory for every change, as recorded in [AGENTS.md](AGENTS.md). Immutable synthetic profile fixtures cover the released storage formats, including completed results, custom games, and resumable progress.

**Controls:** click **Begin trial** to capture your mouse; **Esc** pauses and releases it. Track the moving capsule without clicking; in Snap aiming, left-click the spheres. Expired targets disappear after 2.5 seconds. The fullscreen control expands the desktop window.

Each comparison automatically advances after a five-second review while mouse capture remains active. Use **1** for lower, **2** for higher, **3** to retain the center, **P** to pause, **R** to repeat, and **Space** to continue. Esc releases the mouse and pauses the timer so you can use the buttons. Once capture is released, click Begin trial to capture it again. Interrupted trials restart and do not contribute partial scores.

Normal calibration takes about 12–15 minutes plus setup. Close-score repeats and breaks extend this. Your progress is committed after every completed trial. Home lets you resume, practice, view conversions, recalibrate, and review or reactivate saved results.

## Develop and package

Requires Windows 10/11 x64 and **Node.js 22.12 or newer** (tested on 22.14). From the project directory:

```powershell
npm ci
npm run dev
```

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:startup
npm run test:desktop
npm run package
node scripts/desktop-smoke.mjs --packaged
```

`npm run dev:web` provides a browser preview at `http://127.0.0.1:5173`. Desktop builds use the filesystem bridge; the browser preview uses validated localStorage. Local fonts and all 3D geometry are bundled. No runtime service, CDN, login, or API key is needed.

`npm run package` produces the installer, portable executable, `SHA256SUMS.txt`, release notes, and `release/win-unpacked/Sensiviti.exe`. Use `npm run package:installer` or `npm run package:portable` to build one format. The executables are unsigned. Release signing requires your own publisher certificate; no signing identity is bundled. The icon source is `build/icon.svg`; `scripts/generate-icon.ps1` recreates the Windows icon.

## Open source and releases

Sensiviti is [MIT licensed](LICENSE): anyone may use, modify, distribute, or use its source commercially under the license terms. Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

GitHub Actions checks pushes to `main` and pull requests. Pushing a version tag matching `package.json`, such as `v1.0.0`, runs the **Windows release** workflow. It tests, builds both Windows executables, verifies profile loading across restarts, generates checksums, and publishes a GitHub release only after all required checks succeed. See [CONTRIBUTING.md](CONTRIBUTING.md) for release instructions. Player profiles, backups, credentials, local test data, and build outputs are excluded from the source repository.

## Calculation details

Internal sensitivity is **degrees per raw mouse count**. DPI is supplied by the player or estimated from raw counts over a user-measured physical distance; it is never inferred from screen scaling or cursor speed.

```
cm/360 = 914.4 / (DPI × degreesPerCount)
```

- CS2 and Apex hipfire profiles use `degreesPerCount = 0.022 × sensitivity` with standard, unmodified input settings. CS2's supported UI range is 0.0001–8; Apex's profile range is 0.01–20. CS2's console may accept a wider range than its UI profile.
- Minecraft Java uses `degreesPerCount = 1.2 × (0.6 × s + 0.2)³` with `s` in 0–1. The UI displays `s × 200%`; precise `mouseSensitivity:s` is suitable for vanilla `options.txt` while the game is closed. Game mods may change the curve.
- Added hipfire scales are based on the [Source2All converter's catalog](https://github.com/swiiftex/Source2AllSensitivityConverter/blob/main/Services/GameCatalog.cs): VALORANT 0.07, Overwatch 2 / modern CoD / Destiny 2 0.0066, Fortnite 0.005555 per percentage point, Siege 0.00572958 with default multiplier 0.02, and THE FINALS 0.001 degrees per count per sensitivity unit.
- Battlefield 6 uses the approximate infantry-slider model `0.00173624 × (s + 4/3)`. PUBG uses the approximate FPP-at-FOV-90 model `0.002 × 10^(s/50) × 2.49975`. Both are community-derived, explicitly labeled in the app, and require an in-game full-turn check. PUBG at other FOVs or in third-person needs its own measured mapping. All presets support reference-game selection; the trainer FOV is independent of a game's required conversion settings.
- Custom measured scales use `degreesPerCountPerUnit = 914.4 / (measurementDPI × measuredCm360 × measuredSensitivity)`. This assumes a linear scale and unchanged input/FOV settings. Use the matching preset for nonlinear scales. Slider precision and resulting turn-distance differences are shown on conversion cards.
- Out-of-range conversions show the nearest supported value and its turn-distance difference. Display rounding is separated from internal calculations. ADS scope settings are not converted between games.
- Hipfire FOV defaults to 90° horizontal at 16:9, ADS to 55°, and trainer ADS sensitivity to 0.5×. The vertical projection is derived from the reference aspect ratio; resizing preserves vertical FOV. These preferences stay fixed for a session.

The seven PSA offsets are 50%, 50%, 40%, 30%, 20%, 10%, and 5%. Each chosen candidate moves the center halfway toward it. The search runs in angular units, including for nonlinear game scales. Lower-first and higher-first orders alternate. Trials in each pair share deterministic target seeds and equal durations.

Tracking score is time on target / duration. Snap score is (hits / duration) × (hits / shots); no shots score zero. For each drill the relative difference is `(higher − lower) / max(higher, lower)`; two zeros contribute zero. Average the three differences. An absolute advantage below 3% triggers one six-trial repeat in reverse order, then averages per-drill scores across attempts. If still tied, keep the center. Players may override decisions or repeat a round.

The final center is tested against the original in all three drills. It must lead by at least 3% on the combined relative comparison; otherwise the original is recommended. This is a practical performance-guided extension of PSA, not a claim of a scientifically universal optimum.

Motion is evaluated from absolute elapsed time. Metrics use a fixed 240 Hz evaluation clock and timestamped mouse orientations rather than counting rendered frames. A renderer suspension longer than 500 ms pauses the current trial. Unadjusted pointer lock must succeed before scoring; there is no silent accelerated-input fallback.

Formula references: [PSA comparison example](https://www.psamethod.com/), [Valve mouse input source](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/client/in_mouse.cpp), [Apex input configuration dump](https://gist.github.com/CasualX/197e6dcffa9a9f28fee9ff50012d9e11), [Minecraft mouse processing reference](https://modrinth.com/mod/tweak-mouse-sensitivity), [raw pointer lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API). Source-family constants and game conversion profiles assume standard settings; actual installed-game physical measurements remain a manual acceptance check.

## Storage and architecture

- `src/core/`: pure conversion, scoring, PSA queue, deterministic motion, shared types, and Zod validation.
- `src/engine/`: Three.js arena and raw-input measurement.
- `src/components/` and `src/App.tsx`: wizard, dashboard, trainer, review, results, practice, history, and settings.
- `electron/`: isolated preload API and sandboxed desktop window; validated IPC provides only load/save, backup import/export, and fullscreen.
- `tests/`: unit tests and browser flow tests. `scripts/desktop-smoke.mjs` exercises the actual built Electron app.

Desktop data is stored in `%APPDATA%/Sensiviti/sensiviti.json`. The executable is portable; its profile stays local to the Windows user by default. Set the optional `SENSIVITI_DATA_DIR` environment variable to an absolute folder to store the profile elsewhere, including beside a portable copy. Export/import in Settings moves that profile to another device. Saves are serialized and replace the JSON file atomically. Invalid saved files are preserved and surfaced with recovery options. Import validates the backup before asking to replace the current data. Profiles and backups are limited to 16 MB. The app keeps up to 500 saved sessions.

The renderer has no Node.js integration. Context isolation, process sandboxing, a production Content Security Policy, sender-checked IPC, and blocked external navigation are enabled. The build-only `global-agent` override selects its maintained 4.x release; production dependencies and the full installed dependency tree pass `npm audit` at implementation time.

## Verification

Automated coverage includes PSA midpoints and the exact offset schedule; zero scores and ties; full reversed repeats; matched seeds; overrides; final validation; game conversion round trips, boundaries and DPI changes; deterministic 60/144/240 Hz scoring; setup validation; browser onboarding, pause/restart, resumability, auto-review progression, history, copy actions, game selection, and compact layouts. Desktop smoke checks local IPC persistence, real unadjusted pointer-lock acquisition, Three.js rendering, Escape pause, and sandbox configuration.

Before publishing broadly, verify **physical** input mapping with your own mouse: at 800 DPI and CS2 sensitivity 1.0, a full turn should take about 51.95 cm; at 1600 DPI it should take 25.98 cm. Compare against CS2 and Apex with default yaw and acceleration disabled, and Minecraft Java with the displayed exact options value. A software test cannot physically measure the user's mouse or confirm their configured hardware DPI.
