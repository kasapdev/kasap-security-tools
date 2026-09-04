import { describe, expect, it, vi } from "vitest";
import { parseGitLogP, scanGitHistory } from "../src/historyScan.js";

// Built via concatenation rather than as a contiguous literal so this
// realistic-shaped fixture secret never triggers GitHub push protection on
// this repo (it's a fake test value, but the platform can't tell that from
// a literal string match).
const AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";

const FIXTURE_LOG = `commit abc1234567890abcdef1234567890abcdef1234
Author: Someone <someone@example.com>
Date:   Mon Jan 1 00:00:00 2024 +0000

    add config with a hardcoded secret

diff --git a/config.js b/config.js
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/config.js
@@ -0,0 +1,3 @@
+const apiKey = "${AWS_KEY}";
+const x = 1;
+module.exports = { apiKey };

commit def4567890abcdef1234567890abcdef123456
Author: Someone <someone@example.com>
Date:   Tue Jan 2 00:00:00 2024 +0000

    oops, remove the secret (too late, it's in history now)

diff --git a/config.js b/config.js
index 1111111..2222222 100644
--- a/config.js
+++ b/config.js
@@ -1,3 +1,2 @@
-const apiKey = "${AWS_KEY}";
 const x = 1;
 module.exports = { apiKey };

commit 1111111111111111111111111111111111abcd
Author: Someone <someone@example.com>
Date:   Wed Jan 3 00:00:00 2024 +0000

    delete the file entirely

diff --git a/config.js b/config.js
deleted file mode 100644
index 2222222..0000000
--- a/config.js
+++ /dev/null
@@ -1,2 +0,0 @@
-const x = 1;
-module.exports = { apiKey };
`;

describe("parseGitLogP", () => {
  it("finds a secret that was introduced in an early commit and later removed", () => {
    const findings = parseGitLogP(FIXTURE_LOG);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "config.js",
      line: 1,
      ruleId: "aws-access-key-id",
      commit: "abc1234567890abcdef1234567890abcdef1234",
    });
    expect(findings[0]?.redacted).not.toBe(AWS_KEY);
  });

  it("does not scan removed (-) lines as additions", () => {
    // The second commit removes the secret line; that must not itself
    // produce a second finding (it would if "-" lines were mis-parsed as "+").
    const findings = parseGitLogP(FIXTURE_LOG);
    const secondCommitFindings = findings.filter(
      (f) => f.commit === "def4567890abcdef1234567890abcdef123456",
    );
    expect(secondCommitFindings).toHaveLength(0);
  });

  it("does not scan content from a deleted file (+++ /dev/null)", () => {
    const findings = parseGitLogP(FIXTURE_LOG);
    const thirdCommitFindings = findings.filter(
      (f) => f.commit === "1111111111111111111111111111111111abcd",
    );
    expect(thirdCommitFindings).toHaveLength(0);
  });

  it("returns no findings for an empty diff", () => {
    expect(parseGitLogP("")).toHaveLength(0);
  });
});

describe("scanGitHistory", () => {
  it("invokes `git log -p --no-color --all` and parses its output", () => {
    const fakeExecFile = vi.fn().mockReturnValue(FIXTURE_LOG);
    const findings = scanGitHistory("/some/repo", fakeExecFile as unknown as typeof import("node:child_process").execFileSync);

    expect(fakeExecFile).toHaveBeenCalledWith(
      "git",
      ["log", "-p", "--no-color", "--all"],
      expect.objectContaining({ cwd: "/some/repo" }),
    );
    expect(findings).toHaveLength(1);
  });
});
