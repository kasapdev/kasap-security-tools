import { describe, expect, it, vi } from "vitest";
import { liveCheck } from "../src/liveCheck.js";

// This suite mocks `fetch` entirely (via the injectable `fetchImpl` option)
// so it never makes a real network call, per the project's CI policy. See
// the package README for why liveCheck's real-network behavior is an
// intentionally manual-only path.

function mockResponse(headers: Record<string, string>): Response {
  return new Response(null, { status: 204, headers });
}

describe("liveCheck", () => {
  it("sends an OPTIONS preflight with Origin and Access-Control-Request-Method", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({}));
    await liveCheck("https://api.example.com/widgets", { fetchImpl, probeOrigin: "https://probe.invalid" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/widgets",
      expect.objectContaining({
        method: "OPTIONS",
        headers: expect.objectContaining({
          Origin: "https://probe.invalid",
          "Access-Control-Request-Method": "GET",
        }),
      }),
    );
  });

  it("flags wildcard-origin-with-credentials from real response headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        "access-control-allow-origin": "*",
        "access-control-allow-credentials": "true",
      }),
    );
    const findings = await liveCheck("https://api.example.com", { fetchImpl });
    expect(findings.map((f) => f.ruleId)).toContain("wildcard-origin-with-credentials");
  });

  it("flags reflected-origin-without-validation when ACAO echoes back our probe origin", async () => {
    const probeOrigin = "https://probe.invalid";
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ "access-control-allow-origin": probeOrigin }),
    );
    const findings = await liveCheck("https://api.example.com", { fetchImpl, probeOrigin });
    expect(findings.map((f) => f.ruleId)).toContain("reflected-origin-without-validation");
  });

  it("reports nothing for a well-configured static-origin, no-credentials response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        "access-control-allow-origin": "https://trusted-frontend.example",
        "access-control-allow-methods": "GET, POST",
      }),
    );
    const findings = await liveCheck("https://api.example.com", {
      fetchImpl,
      probeOrigin: "https://probe.invalid",
    });
    expect(findings).toHaveLength(0);
  });

  it("flags missing Vary: Origin when the origin is reflected but Vary omits it", async () => {
    const probeOrigin = "https://probe.invalid";
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        "access-control-allow-origin": probeOrigin,
        vary: "Accept-Encoding",
      }),
    );
    const findings = await liveCheck("https://api.example.com", { fetchImpl, probeOrigin });
    expect(findings.map((f) => f.ruleId)).toContain("missing-vary-origin");
  });

  it('flags null-origin-allowed when ACAO is the literal string "null"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ "access-control-allow-origin": "null" }));
    const findings = await liveCheck("https://api.example.com", { fetchImpl });
    expect(findings.map((f) => f.ruleId)).toContain("null-origin-allowed");
  });

  it("respects assumePublicApi to suppress the informational wildcard-origin finding", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ "access-control-allow-origin": "*" }));
    const findings = await liveCheck("https://api.example.com", { fetchImpl, assumePublicApi: true });
    expect(findings.map((f) => f.ruleId)).not.toContain("wildcard-origin");
  });
});
