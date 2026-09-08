#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { liveCheck } from "./liveCheck.js";
import { normalizeFromConfig } from "./normalize.js";
import { runCorsRules } from "./rules.js";
import { simulatePreflight } from "./simulate.js";
import type { CorsConfigLike, CorsFinding, Severity } from "./types.js";

const SEVERITY_ORDER: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function report(findings: CorsFinding[], opts: { json?: boolean; failOn?: string }): void {
  if (opts.json) {
    console.log(JSON.stringify(findings, null, 2));
  } else if (findings.length === 0) {
    console.log("No CORS misconfigurations found.");
  } else {
    for (const finding of findings) {
      console.log(`[${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.message}`);
    }
    console.log(`\n${findings.length} finding(s).`);
  }

  if (opts.failOn) {
    const threshold = SEVERITY_ORDER[opts.failOn as Severity];
    if (threshold === undefined) {
      console.error(
        `Invalid --fail-on value "${opts.failOn}". Must be one of: critical, high, medium, low.`,
      );
      process.exitCode = 2;
      return;
    }
    if (findings.some((f) => SEVERITY_ORDER[f.severity] >= threshold)) {
      process.exitCode = 1;
    }
  }
}

const program = new Command();

program
  .name("cors-config-validator")
  .description("Audits a CORS configuration (live URL or config file) for common security misconfigurations.");

program
  .command("check-config <file>")
  .description(
    "Audit a JSON CORS config file (e.g. an Express `cors` package options object). Makes no network call.",
  )
  .option("--json", "output findings as JSON instead of a human-readable list")
  .option("--fail-on <severity>", "exit 1 if any finding is at or above this severity (critical|high|medium|low)")
  .action((file: string, opts: { json?: boolean; failOn?: string }) => {
    const raw = readFileSync(file, "utf8");
    const config = JSON.parse(raw) as CorsConfigLike;
    const findings = runCorsRules(normalizeFromConfig(config));
    report(findings, opts);
  });

program
  .command("check-url <url>")
  .description(
    "Send a real CORS preflight probe against a live URL and audit the response headers. " +
      "Only run this against systems you are explicitly authorized to test.",
  )
  .requiredOption(
    "--i-am-authorized",
    "confirm you are explicitly authorized to test this URL (required — this makes a real network request)",
  )
  .option("--assume-public-api", "suppress the informational wildcard-origin finding")
  .option("--json", "output findings as JSON instead of a human-readable list")
  .option("--fail-on <severity>", "exit 1 if any finding is at or above this severity (critical|high|medium|low)")
  .action(
    async (
      url: string,
      opts: { json?: boolean; failOn?: string; assumePublicApi?: boolean; iAmAuthorized?: boolean },
    ) => {
      const findings = await liveCheck(url, { assumePublicApi: opts.assumePublicApi });
      report(findings, opts);
    },
  );

program
  .command("simulate <file>")
  .description(
    "Simulate a single cross-origin request against a JSON CORS config file and report exactly what the " +
      "policy would allow or deny, per the real Fetch/CORS spec rules. Makes no network call.",
  )
  .requiredOption("--origin <origin>", "the request Origin to simulate, e.g. https://partner.example")
  .requiredOption("--method <method>", "the request method to simulate, e.g. PUT")
  .option(
    "--headers <headers>",
    "comma-separated list of non-simple request headers to simulate, e.g. Authorization,X-Api-Key",
  )
  .option("--json", "output the result as JSON instead of a human-readable summary")
  .action(
    (file: string, opts: { origin: string; method: string; headers?: string; json?: boolean }) => {
      const raw = readFileSync(file, "utf8");
      const config = JSON.parse(raw) as CorsConfigLike;
      const requestHeaders = opts.headers
        ? opts.headers
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean)
        : undefined;
      const result = simulatePreflight(config, { origin: opts.origin, method: opts.method, requestHeaders });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(result.allowed ? "ALLOWED" : "DENIED");
      console.log(`  origin:  ${result.origin.allowed ? "ok" : "DENIED"} — ${result.origin.reason}`);
      console.log(`  method:  ${result.method.allowed ? "ok" : "DENIED"} — ${result.method.reason}`);
      console.log(`  headers: ${result.headers.allowed ? "ok" : "DENIED"} — ${result.headers.reason}`);
      if (result.blockedByCredentialsWildcard) {
        console.log("  credentials: BLOCKED — a wildcard cannot satisfy a credentialed request per spec.");
      }
      if (!result.allowed) {
        process.exitCode = 1;
      }
    },
  );

await program.parseAsync(process.argv);
