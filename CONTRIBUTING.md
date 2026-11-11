# Contributing

Bug reports, fixes, and improvements are welcome. This project is MIT licensed.

Use Windows x64 with Node.js 22.12 or newer. Run `npm ci`, then `npm run dev`.
Before submitting a change, run `npm run typecheck`, `npm test`,
`npm run test:e2e`, `npm run build`, and `npm run test:startup`.
Install the browser test runtime once with `npx playwright install chromium`.

In-game F11 measurement uses the passive Windows Raw Input receiver in `native/TurnCapture.cs`.
`npm run dev` and `npm run build` compile it using the Windows .NET Framework 4.x C# compiler;
no native binary is checked in. Run `npm run test:native` for registration, hotkey cleanup,
and packet-decoding checks. The startup checks also launch/cancel the real helper through
the sandboxed desktop bridge. Browser tests mock only that native transport.
For hardware QA, arm measurement in My games, switch to a game, and mark three complete
hipfire turns with F11. Verify focus-loss cancellation and that F11 works normally after
completion, cancellation, navigation, and application exit. Packet fixtures cannot verify
a game's input behavior or the player's exact 360-degree endpoint.

Keep calibration math independent of the renderer, preserve saved profile compatibility,
and include regression tests for changes to calculations or persistence. Do not commit
real player profiles, exported backups, credentials, test captures, or built executables.
Use reproducible sample data in tests. Contributions are provided under the MIT license.

The permanent compatibility requirements are in [AGENTS.md](AGENTS.md). Keep existing
`tests/fixtures/profiles/` snapshots immutable and test every released storage format.
Add a synthetic snapshot when introducing a new persisted format or additive fields.

## Publishing a release

1. Update `version` in `package.json` and the lockfile together.
2. Merge tested source into `main`.
3. Create and push the matching tag, for example `git tag -a v1.0.1 -m "Sensiviti 1.0.1"`
   followed by `git push origin v1.0.1`.

The **Windows release** workflow checks the version, runs tests, builds the Windows x64
installer and portable executable, verifies saved-profile startup, creates SHA-256
checksums, and publishes the complete release. Only the publish job receives repository
write permission. Public releases are never silently replaced on rerun.

For a local build, use `npm run package`. It creates both executables and release
checksums under `release/`. Code signing is not configured; enabling signing requires
a maintainer's own Windows publisher certificate.

Desktop update notifications use the public GitHub `releases/latest` endpoint. Keep stable
tags in `vMAJOR.MINOR.PATCH` form and preserve the versioned setup/portable asset names.
Only complete, published stable releases with a newer numeric version are offered. The
release workflow uploads assets before publishing so checks cannot offer a partial upload.
The portable wrapper supplies `PORTABLE_EXECUTABLE_FILE` to select the right download.
No player-profile fields are used for update state, and no executable is replaced in place.
Unit tests cover scheduling, timeout/offline recovery, version/asset validation and URL
restrictions. Browser tests exercise notifications and Settings; startup checks exercise
the actual sandboxed IPC with HTTP/browser launch stubbed. The packaged desktop smoke
also verifies portable edition detection. Development builds never poll automatically.
