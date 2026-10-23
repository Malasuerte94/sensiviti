# Contributing

Bug reports, fixes, and improvements are welcome. This project is MIT licensed.

Use Windows x64 with Node.js 22.12 or newer. Run `npm ci`, then `npm run dev`.
Before submitting a change, run `npm run typecheck`, `npm test`,
`npm run test:e2e`, `npm run build`, and `npm run test:startup`.
Install the browser test runtime once with `npx playwright install chromium`.

Keep calibration math independent of the renderer, preserve saved profile compatibility,
and include regression tests for changes to calculations or persistence. Do not commit
real player profiles, exported backups, credentials, test captures, or built executables.
Use reproducible sample data in tests. Contributions are provided under the MIT license.

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
