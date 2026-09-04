import { describe, expect, it } from "vitest";
import { matchDetectors } from "../src/detectors.js";

// Built via concatenation rather than as contiguous literals so these
// realistic-shaped fixture secrets never trigger GitHub push protection on
// this repo (they're fake test values, but the platform can't tell that
// from a literal string match).
const AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";
const GITHUB_PAT = "ghp_" + "1234567890abcdefghijklmnopqrstuvwxyzAB";
const SLACK_TOKEN = "xoxb-" + "1234567890-1234567890123-abcdefghijklmnopqrstuvwx";

describe("matchDetectors", () => {
  it("matches an AWS access key ID", () => {
    const results = matchDetectors(`const key = "${AWS_KEY}";`);
    expect(results.map((r) => r.detector.id)).toContain("aws-access-key-id");
    expect(results.find((r) => r.detector.id === "aws-access-key-id")?.match).toBe(AWS_KEY);
  });

  it("matches a PEM private key header", () => {
    const results = matchDetectors("-----BEGIN RSA PRIVATE KEY-----");
    expect(results.map((r) => r.detector.id)).toContain("private-key-header");
  });

  it("matches an OpenSSH private key header", () => {
    const results = matchDetectors("-----BEGIN OPENSSH PRIVATE KEY-----");
    expect(results.map((r) => r.detector.id)).toContain("private-key-header");
  });

  it("matches a Slack bot token", () => {
    const results = matchDetectors(`SLACK_TOKEN = "${SLACK_TOKEN}"`);
    expect(results.map((r) => r.detector.id)).toContain("slack-token");
  });

  it("matches a GitHub personal access token", () => {
    const results = matchDetectors(`export GITHUB_TOKEN=${GITHUB_PAT}`);
    expect(results.map((r) => r.detector.id)).toContain("github-token");
  });

  it("matches a generic api_key assignment", () => {
    const results = matchDetectors('api_key = "sk_test_abcdefghij1234567890"');
    expect(results.map((r) => r.detector.id)).toContain("generic-api-key-assignment");
  });

  it("does not match plain prose with no secret-shaped content", () => {
    const results = matchDetectors("This is just a normal comment about configuration.");
    expect(results).toHaveLength(0);
  });

  it("finds multiple distinct matches on one line", () => {
    const line = `${AWS_KEY} and ${GITHUB_PAT} together`;
    const results = matchDetectors(line);
    expect(results.map((r) => r.detector.id).sort()).toEqual(
      ["aws-access-key-id", "github-token"].sort(),
    );
  });

  it("resets regex state between calls (global regex lastIndex safety)", () => {
    matchDetectors(`const a = "${AWS_KEY}";`);
    const second = matchDetectors(`const b = "${AWS_KEY}";`);
    expect(second.map((r) => r.detector.id)).toContain("aws-access-key-id");
  });
});
