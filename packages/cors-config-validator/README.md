# @kasap/cors-config-validator

A CLI + rule engine that audits a CORS configuration for common security
misconfigurations, in two modes:

- **`check-config <file>`** — parses a JSON config object (the common shape
  used by the Express `cors` package and similar middleware) and audits it.
  Makes **no network call**.
- **`check-url <url>`** — sends a real CORS preflight (`OPTIONS` with
  `Origin` + `Access-Control-Request-Method`) against a live URL and audits
  the response headers.
- **`simulate <file>`** — given a request origin, method, and headers,
  computes exactly what a config file would allow or deny for that specific
  request, per the real Fetch/CORS spec rules. Makes no network call.

Both audit modes run the exact same rule engine (`runCorsRules`) over a
shared normalized representation, so the security logic is identical either
way. `simulate` is a separate, complementary tool: it answers "would this
one request actually be allowed?" instead of "what's wrong with this
policy in general?".

> **Intended use / authorization notice**
>
> `check-url` (live-check mode) sends real HTTP requests. **Only ever run it
> against a URL you own or are explicitly authorized to test.** Probing
> third-party APIs without permission is not an intended use of this tool —
> it is a defensive/educational auditing tool for your own systems, not a
> reconnaissance tool. The CLI requires an explicit `--i-am-authorized` flag
> before it will run a live check, as a deliberate speed bump.

## Usage

### Config-file mode (no network)

```bash
cors-config-validator check-config ./cors-config.json
cors-config-validator check-config ./cors-config.json --json
cors-config-validator check-config ./cors-config.json --fail-on high   # CI use
```

Example `cors-config.json` (Express `cors`-package shape):

```json
{
  "origin": true,
  "credentials": true,
  "methods": ["GET", "POST"],
  "allowedHeaders": "*"
}
```

### Live-check mode (real network — authorized targets only)

```bash
cors-config-validator check-url https://api.example.com/widgets --i-am-authorized
```

This sends an `OPTIONS` preflight with a randomly-generated, clearly
non-allowlisted `Origin` (e.g. `https://cors-audit-probe-x7f2q1.invalid`) and
inspects the response's `Access-Control-Allow-*` headers. If the server
reflects that origin back verbatim, its origin allowlist isn't actually
being enforced.

## Simulate a preflight request

`check-config` tells you what's generically wrong with a policy. `simulate`
answers a much more concrete question: **would this specific request
actually be allowed?**

```bash
cors-config-validator simulate ./cors-config.json \
  --origin https://partner.example \
  --method PUT \
  --headers Authorization,X-Api-Key
```

Given `cors-config.json`:

```json
{
  "origin": ["https://partner.example"],
  "credentials": true,
  "methods": ["GET", "PUT"],
  "allowedHeaders": ["Authorization"]
}
```

this reports `DENIED`, with `headers: DENIED — Requested header(s) not
covered by the configured allowedHeaders list (case-insensitive match):
X-Api-Key.` — everything else (origin, method, credentials) checks out, but
`X-Api-Key` isn't on the allowlist.

`simulate` implements the real spec mechanics, not a guess:

- **Origin matching** — handles every shape `origin` can take in a
  `cors`-package-style config: `true` (naive reflection), `"*"` (wildcard),
  a static string (exact match), a `string[]` allowlist (exact match, or
  wildcard if `"*"` is one of the entries), a `RegExp` (`.test()`), or a
  function (evaluated using the library's `(origin, callback)` convention,
  with a same-tick boolean return as a fallback — a function that only
  resolves asynchronously can't be simulated without real I/O and is
  conservatively treated as a denial).
- **Method matching** — case-insensitive, against the configured
  `methods` list or (when unset) the `cors` package's own documented
  default (`GET,HEAD,PUT,PATCH,POST,DELETE`).
- **Header matching** — case-insensitive per the Fetch spec's field-name
  comparison rules. When `allowedHeaders` is unset, the `cors` package
  reflects back whatever was requested rather than denying it — `simulate`
  matches that real default instead of assuming a deny-all.
- **Credentials + wildcard** — per spec, a wildcard (`"*"`) never satisfies
  a credentialed request, even if it "matched" on paper. `simulate` flags
  this as `blockedByCredentialsWildcard` and folds it into the overall
  `allowed` verdict. Naive reflection (`origin: true`) is *not* a wildcard
  in this sense — the literal origin is echoed back, which does satisfy the
  spec's credentialed-request requirement (it's still a real security
  problem, just a different one — see `reflected-origin-without-validation`
  above).

Library API:

```ts
import { simulatePreflight } from "@kasap/cors-config-validator";

const result = simulatePreflight(
  { origin: ["https://partner.example"], credentials: true, methods: ["GET", "PUT"], allowedHeaders: ["Authorization"] },
  { origin: "https://partner.example", method: "PUT", requestHeaders: ["Authorization", "X-Api-Key"] },
);
// result.allowed === false
// result.headers.disallowed === ["X-Api-Key"]
// result.reasons[0] mentions the uncovered header
```

## Rules

| Rule ID | Severity | What it flags |
| --- | --- | --- |
| `wildcard-origin-with-credentials` | critical | `Access-Control-Allow-Origin: *` combined with `Access-Control-Allow-Credentials: true` — invalid per spec, and a real misconfiguration when a server sets both anyway. |
| `wildcard-origin` | medium | Bare `Access-Control-Allow-Origin: *` (no credentials). Informational — suppress with `--assume-public-api` for endpoints meant to be fully public. |
| `reflected-origin-without-validation` | high / critical (critical if credentials are also allowed) | The server echoes the request's `Origin` back unconditionally (live: detected by probing with an arbitrary origin; config-file: `origin: true`). |
| `null-origin-allowed` | high / critical (critical if credentials are also allowed) | The literal string `"null"` is an allowed origin (live: `Access-Control-Allow-Origin: null`; config-file: `origin: "null"` or an allowlist array containing `"null"`). `Origin: null` is sent by sandboxed `<iframe>` documents, `data:`/`file:` pages, and some redirected requests, so it's an attacker-reachable value, not a safe static allowlist entry. |
| `overly-broad-methods-or-headers-with-credentials` | critical | `Access-Control-Allow-Methods`/`-Headers` is `*` while credentials are allowed. |
| `overly-broad-methods-or-headers` | low | `Access-Control-Allow-Methods`/`-Headers` is `*` without credentials — still worth tightening. |
| `missing-vary-origin` | medium | Origin is genuinely reflected (not a plain wildcard) but the response lacks `Vary: Origin` — a caching-security issue (a shared cache could leak one origin's response to another). A plain `Access-Control-Allow-Origin: *` response sends the same header for every caller, so it's not evaluated here — there's nothing `Vary: Origin` would protect against. Only evaluated when the real response `Vary` header is known (live-check mode; not evaluated in config-file mode, since there's no real response to inspect). |

## Library API

```ts
import { runCorsRules, normalizeFromConfig, normalizeFromHeaders, liveCheck, simulatePreflight } from "@kasap/cors-config-validator";

// Config-file mode
const findings = runCorsRules(normalizeFromConfig({ origin: true, credentials: true }));

// Live-check mode
const liveFindings = await liveCheck("https://api.example.com", { assumePublicApi: false });

// Simulate a specific request against a config
const simResult = simulatePreflight(
  { origin: ["https://partner.example"], methods: ["GET", "PUT"] },
  { origin: "https://partner.example", method: "PUT" },
);
```

## Tests

```bash
pnpm --filter @kasap/cors-config-validator test
```

The rule engine and header/config normalization are covered with fixture
header-sets and config objects — no network access. `liveCheck` itself is
covered with `fetch` fully mocked (via the injectable `fetchImpl` option),
so the automated suite never makes a real network call; exercising it
against a real server is an intentionally manual-only step (see the
authorization notice above). `simulatePreflight` is covered with fixture
configs and requests across every origin/method/header shape it supports,
including the credentials + wildcard interaction.
