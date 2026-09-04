# kasap-security-tools

[![CI](https://github.com/kasapdev/kasap-security-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/kasapdev/kasap-security-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

3 small, real **defensive/educational** security tools — not exploit
tooling. A pnpm workspace monorepo, TypeScript/ESM, real vitest coverage
with no live network/git calls in the automated test suite.

- [secret-scanner-lite](packages/secret-scanner-lite) — scans a directory
  (and optionally full git history via `git log -p`, so it catches secrets
  that were committed and later removed) for likely credentials using
  shape-based detectors plus a conservative entropy fallback. Redacts every
  reported value. Only ever scan repos you're authorized to scan.
- [rate-limit-middleware-kit](packages/rate-limit-middleware-kit) — real
  token-bucket and sliding-window-log rate limiters, framework-agnostic with
  thin Express/Fastify adapters, an injectable clock for deterministic
  tests, and a pluggable store interface (in-memory implementation included).
- [cors-config-validator](packages/cors-config-validator) — a rule engine
  that flags common CORS misconfigurations (wildcard origin + credentials,
  overly broad methods/headers, missing `Vary: Origin`, naive
  reflect-everything configs). Supports a config-file mode (no network) and
  a live-check mode against a URL you're authorized to test.

## Install & verify

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## License

[MIT](LICENSE)
