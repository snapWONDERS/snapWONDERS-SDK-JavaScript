# Changelog

All notable changes to `@snapwonders/sdk` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-08-16

### Added
- **Direct upload.** Files at or under the server's cap (95 MB by default) now go up in a single
  `POST /api/upload` instead of the TUS create/PATCH sequence — one round trip instead of three,
  which matters most over Tor and I2P.
- `UploadError`, a protocol-neutral base that `TusUploadError` now extends. Both upload paths throw
  it, so a caller no longer has to know which one ran to catch a failure.

### Changed
- `AnalyseSession`, `ConvertSession` and `StegoSession` now carry `maxUploadBytes`, read from the
  session-create response, so the cap can move server-side without an SDK release.
- `session.upload()` returns the server's `storage_uid` for direct uploads and the TUS upload URL
  for large ones. Previously it was always the TUS URL. Neither value is needed for the normal
  flow — uploads are confirmed with `files()` and jobs are keyed by `uploadUid`.

### Unchanged
- `tus.ts` is untouched. TUS remains the path for files over the cap, and is still what handles
  resumption on an unreliable connection.

## [0.1.1] — 2026

- Documentation only: refreshed the README (published-to-npm status, illustrated demo). Declared
  `@types/node` as a dev dependency so the standalone repo type-checks in CI.

## [0.1.0] — 2026

Initial release.

- Official JavaScript/TypeScript client for the snapWONDERS API, covering all three product areas:
  `client.stego` (hide & reveal), `client.analyse` (forensic media analysis), and `client.convert`
  (media conversion).
- Resumable upload and the session → job → poll → download flow wrapped internally, so a whole job
  is a single `await`. One-shot helpers plus step-by-step session/job control.
- Polling backs off with jitter and honours a server-supplied poll interval, to stay light under load.
- Typed errors (`SnapwondersError` base): `AuthError`, `ProRequiredError`, `SessionExpiredError`,
  `RateLimitError`, `MaintenanceError`, `JobFailedError`, `TusUploadError`, `NetworkError`, `ApiError`.
- Zero runtime dependencies — uses the global `fetch` (Node ≥ 18).
