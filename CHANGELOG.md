# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 2026-09-06

### Fixed

- `@kasap/secret-scanner-lite`: `redact()` no longer returns `"***"` for an
  empty string input. Since `redact` is a public library export, calling it
  directly with `""` previously fabricated asterisks that misleadingly
  implied a secret had been found when there was nothing to redact at all.
  It now returns `""` for empty input. (This path is unreachable from the
  scanner's own detectors, which never match zero-length strings, so this
  only affects direct library callers.) Added a regression test in
  `packages/secret-scanner-lite/tests/redact.test.ts`.
