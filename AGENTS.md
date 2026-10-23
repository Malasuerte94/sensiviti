# Repository instructions

## Saved-data compatibility

Every change must remain compatible with all previously released Sensiviti profiles and JSON backups. This is a permanent product requirement.

- Preserve existing setup, calibration progress, saved results, game libraries, and custom games across updates and restarts.
- Add persisted fields with safe defaults for older files. If a format must change, implement and test an explicit, lossless migration before changing its version.
- Keep completed calibration records intact. Store DPI corrections and other reinterpretations as separate metadata; do not rewrite historical trials, decisions, or scores.
- Never silently reset a profile, discard unsupported data, or overwrite an invalid file with defaults. Preserve the original file and offer recovery.
- Keep immutable synthetic fixtures for each released storage format. Add regression tests for loading, saving, backup round trips, and resumability whenever persistence changes.
- Verify old-version profile loading in the desktop startup checks before publishing a release. Never use a real player's profile as a committed fixture.

## Verification and release

Follow CONTRIBUTING.md. Run type checking, unit tests, browser tests, a production build, and desktop startup checks for relevant changes. For releases, build and verify both Windows executables and checksums. Keep player profiles, credentials, and built executables out of Git.
