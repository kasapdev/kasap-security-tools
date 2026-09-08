export { runCorsRules } from "./rules.js";
export type { RuleOptions } from "./rules.js";

export { normalizeFromConfig, normalizeFromHeaders } from "./normalize.js";

export { liveCheck } from "./liveCheck.js";
export type { LiveCheckOptions } from "./liveCheck.js";

export { simulatePreflight } from "./simulate.js";
export type {
  HeadersCheckResult,
  MethodCheckResult,
  OriginCheckResult,
  OriginMatchKind,
  PreflightSimulationResult,
  SimulatedRequest,
} from "./simulate.js";

export type { CorsConfigLike, CorsFinding, CorsHeaders, NormalizedCors, Severity } from "./types.js";
