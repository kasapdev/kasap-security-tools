#!/usr/bin/env node
import { Command } from "commander";
import { scanRepository } from "./index.js";
import type { Finding } from "./types.js";

function formatFinding(f: Finding): string {
  const location = `${f.file}:${f.line}`;
  const commitSuffix = f.commit ? ` (commit ${f.commit.slice(0, 7)})` : "";
  return `[${f.severity.toUpperCase()}] ${f.ruleId} ${location} -> ${f.redacted}${commitSuffix}`;
}

const program = new Command();

program
  .name("secret-scanner-lite")
  .description(
    "Scans a directory (working tree, and optionally full git history) for likely-committed secrets.",
  )
  .argument("[path]", "directory to scan", ".")
  .option("--json", "output findings as JSON instead of a human-readable list")
  .option("--fail-on-match", "exit with code 1 if any findings are reported (useful in CI)")
  .option("--history", "also scan full git history via `git log -p` (requires a git repo)")
  .option(
    "--exclude <glob>",
    "glob pattern to exclude (repeatable)",
    (value: string, previous: string[]) => [...previous, value],
    [] as string[],
  )
  .action(
    (
      path: string,
      opts: { json?: boolean; failOnMatch?: boolean; history?: boolean; exclude: string[] },
    ) => {
      const findings = scanRepository(path, { exclude: opts.exclude, history: opts.history });

      if (opts.json) {
        console.log(JSON.stringify(findings, null, 2));
      } else if (findings.length === 0) {
        console.log("No likely secrets found.");
      } else {
        for (const finding of findings) {
          console.log(formatFinding(finding));
        }
        console.log(`\n${findings.length} finding(s).`);
      }

      if (opts.failOnMatch && findings.length > 0) {
        process.exitCode = 1;
      }
    },
  );

program.parse(process.argv);
