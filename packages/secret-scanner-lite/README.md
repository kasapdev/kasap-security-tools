# @kasap/secret-scanner-lite

A small, dependency-light CLI that scans a directory — and optionally a git
repository's *full history* — for likely-committed secrets: AWS keys, GitHub
and Slack tokens, PEM private key headers, generic `api_key = "..."`
assignments, and, as a fallback, generic high-entropy string literals.

> **Intended use / authorization notice**
>
> Only run this against repositories you own or are explicitly authorized to
> scan. Scanning someone else's private code without permission is not an
> intended use of this tool. This is a defensive/educational tool meant to
> help you find secrets in *your own* history before they leak further, not
> a tool for probing third-party systems or codebases.

## Why history scanning matters

Removing a secret from the current working tree does **not** remove it from
git history — anyone who clones the repo can still `git log -p` and find it
in an old commit. That's the real value gitleaks-style tools provide, and
it's why `--history` here runs a real `git log -p` diff scan, not just a
working-tree walk.

## Install / build

From the repo root:

```bash
pnpm install
pnpm --filter @kasap/secret-scanner-lite build
```

## Usage

```bash
# Scan the working tree of the current directory
node packages/secret-scanner-lite/dist/cli.js .

# Also scan full git history (requires a git repo)
node packages/secret-scanner-lite/dist/cli.js . --history

# Exclude paths (repeatable)
node packages/secret-scanner-lite/dist/cli.js . --exclude "*.test.ts" --exclude "fixtures"

# Machine-readable output
node packages/secret-scanner-lite/dist/cli.js . --json

# CI use: exit code 1 if anything is found
node packages/secret-scanner-lite/dist/cli.js . --history --fail-on-match
```

Once published/linked, the same binary is available as `secret-scanner-lite`.

### Output

Findings never include the raw secret value — only a redacted form (first 3
and last 3 characters kept, everything else replaced with `*`; secrets of 6
characters or fewer are fully redacted):

```
[CRITICAL] aws-access-key-id config.js:12 -> AKI**************ZE
```

## Detectors

| Rule ID                       | Shape                                                          | Severity |
| ------------------------------ | --------------------------------------------------------------- | -------- |
| `aws-access-key-id`            | `AKIA[0-9A-Z]{16}`                                              | critical |
| `private-key-header`           | `-----BEGIN (RSA \| EC \| OPENSSH )?PRIVATE KEY-----`             | critical |
| `slack-token`                  | `xox[baprs]-...`                                                | high     |
| `github-token`                 | `gh[pousr]_[A-Za-z0-9]{36,}`                                    | high     |
| `generic-api-key-assignment`   | `api_key = "<20+ chars>"`                                       | medium   |
| `high-entropy-string`          | quoted string literal that passes the entropy heuristic below   | medium   |

## Detection tradeoffs (high-entropy fallback)

The shape-based detectors above are high-confidence by construction. The
generic high-entropy fallback is inherently fuzzier, so it only fires on a
quoted string literal when **all** of the following hold:

- length >= 20 characters
- at least 3 of {lowercase, uppercase, digit, symbol} character classes are
  present (this alone filters out lowercase-hex hashes and IDs)
- it does not match a canonical UUID or a bare 32-64 char hex digest shape
  (git commit hashes, MD5/SHA-1/SHA-256 hex digests) — these can otherwise
  sit right at the entropy threshold and are extremely common non-secret
  values in real codebases
- Shannon entropy >= 4.3 bits/character

This is intentionally conservative: it will miss some real secrets (e.g.
short ones, or ones using a narrow alphabet) in exchange for a much lower
false-positive rate on everyday non-secret strings like UUIDs, hashes, and
ordinary prose. If you want higher recall at the cost of more noise, lower
`ENTROPY_MIN_BITS_PER_CHAR` / `ENTROPY_MIN_CHAR_CLASSES` in
`src/scanContent.ts`.

## How files are discovered

- Inside a git repo: `git ls-files -z` (tracked files only — this naturally
  respects `.gitignore` and skips `.git`).
- Outside a git repo: a manual directory walk that respects a basic
  `.gitignore` at the scan root (comments, `!negation`, trailing-`/`
  dir-only rules, leading-`/` anchoring, `*`/`**`/`?` wildcards) and always
  skips `node_modules/` and `.git/`.
- Binary files are skipped via NUL-byte sniffing on the first chunk (the
  same heuristic `git` itself uses).

## Library API

```ts
import { scanRepository, scanGitHistory, scanText, redact, shannonEntropy } from "@kasap/secret-scanner-lite";

const findings = scanRepository("/path/to/repo", { history: true, exclude: ["*.test.ts"] });
```

## Tests

```bash
pnpm --filter @kasap/secret-scanner-lite test
```

All tests run against fixture strings/diffs — no real git repository or
network access is required.
