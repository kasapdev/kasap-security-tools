# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 2026-09-08

### Added

- `@kasap/cors-config-validator`: new `simulatePreflight()` API + `simulate
  <file>` CLI command. Given a config file and a specific request (origin +
  method + optional non-simple headers), it computes exactly what the
  policy would allow or deny, per the real Fetch/CORS spec — origin
  matching across every shape `origin` can take (`true`, `"*"`, a static
  string, an allowlist array, a `RegExp`, or a `cors`-package-style
  `(origin, callback)` function), method matching (case-insensitive,
  against the configured list or the `cors` package's own default),
  header matching (case-insensitive, with the `cors` package's "reflect
  when unset" default), and the credentials + wildcard interaction (a
  wildcard origin/methods/headers never satisfies a credentialed request,
  even when naive reflection via `origin: true` would). Bumped to 0.2.0.

### Fixed

- `@kasap/cors-config-validator`: the `missing-vary-origin` rule no longer
  fires for a plain `Access-Control-Allow-Origin: "*"` response. It was
  gated on `originIsDynamic`, which is also true for a bare wildcard (not
  just genuine reflection) — but a wildcard response sends the exact same
  ACAO value to every caller, so there's no request-dependent value for a
  shared cache to mix up, and nothing for `Vary: Origin` to protect
  against. The rule now only fires on `reflectsArbitraryOrigin`. Added a
  regression test in `packages/cors-config-validator/tests/rules.test.ts`.

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
