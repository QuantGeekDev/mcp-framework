import { IncomingMessage } from "node:http";
import { AuthProvider, AuthResult } from "../types.js";

/**
 * Trust verification result from AgentPass
 */
export interface AgentPassTrustResult {
  /** Agent handle (e.g. payment-bot.cybersecai.agentpass) */
  agent: string;
  /** Trust level (L0-L4) */
  trustLevel: string;
  /** Numeric trust score (0-100) */
  trustScore: number;
  /** Whether the agent has been identity-verified via ECDSA challenge-response */
  identityVerified: boolean;
  /** AML sanctions screening status */
  sanctionsStatus: string;
  /** Number of completed transactions */
  transactionCount: number;
  /** Agent registration timestamp */
  registeredAt?: string;
}

/**
 * Configuration for AgentPass trust verification
 */
export interface AgentPassConfig {
  /**
   * AgentPass API base URL
   * @default "https://agentpass.co.uk"
   */
  apiUrl?: string;

  /**
   * Minimum trust score required (0-100)
   * Set to 0 to allow all agents but still annotate requests with trust data
   * @default 0
   */
  minTrustScore?: number;

  /**
   * Minimum trust level required (L0-L4)
   * L0: Untrusted, L1: Basic, L2: Verified, L3: Trusted, L4: Certified
   * @default "L0"
   */
  minTrustLevel?: "L0" | "L1" | "L2" | "L3" | "L4";

  /**
   * Require clean AML sanctions screening
   * When true, agents with sanctions violations are rejected
   * @default false
   */
  requireCleanSanctions?: boolean;

  /**
   * Header name for agent identity
   * @default "x-agent-id"
   */
  agentIdHeader?: string;

  /**
   * Behavior when agent identity is missing from request
   * - "reject": Return 401
   * - "allow": Continue without trust data
   * @default "allow"
   */
  onMissing?: "reject" | "allow";

  /**
   * Cache TTL in milliseconds for trust score lookups
   * @default 300000 (5 minutes)
   */
  cacheTtlMs?: number;
}

const TRUST_LEVEL_ORDER = ["L0", "L1", "L2", "L3", "L4"];

/**
 * AgentPass Trust Provider
 *
 * Verifies agent identity and trust scores via AgentPass -- the pre-payment
 * trust gateway for AI agents. Checks identity verification, behavioural
 * trust scoring (L0-L4), and AML sanctions status before allowing requests.
 *
 * AgentPass screens agents through cryptographic identity (ECDSA P-256),
 * behavioural trust scoring, and 75,784-entry AML sanctions databases
 * (UK HMT + OFAC SDN). Trust scores are publicly queryable.
 *
 * @see https://agentpass.co.uk
 * @see https://datatracker.ietf.org/doc/draft-sharif-agent-payment-trust/
 *
 * @example
 * ```typescript
 * import { MCPServer, AgentPassProvider } from "mcp-framework";
 *
 * const server = new MCPServer({
 *   auth: {
 *     provider: new AgentPassProvider({
 *       minTrustScore: 50,
 *       minTrustLevel: "L2",
 *       requireCleanSanctions: true,
 *     }),
 *   },
 * });
 * ```
 */
export class AgentPassProvider implements AuthProvider {
  private config: Required<AgentPassConfig>;
  private cache: Map<string, { result: AgentPassTrustResult; expiry: number }> =
    new Map();

  constructor(config: AgentPassConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl ?? "https://agentpass.co.uk",
      minTrustScore: config.minTrustScore ?? 0,
      minTrustLevel: config.minTrustLevel ?? "L0",
      requireCleanSanctions: config.requireCleanSanctions ?? false,
      agentIdHeader: config.agentIdHeader ?? "x-agent-id",
      onMissing: config.onMissing ?? "allow",
      cacheTtlMs: config.cacheTtlMs ?? 300_000,
    };
  }

  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    const agentId = this.extractAgentId(req);

    if (!agentId) {
      return this.config.onMissing === "allow"
        ? { data: { agentTrust: null } }
        : false;
    }

    const trust = await this.queryTrust(agentId);

    if (!trust) {
      return this.config.onMissing === "allow"
        ? { data: { agentTrust: null } }
        : false;
    }

    // Check minimum trust score
    if (trust.trustScore < this.config.minTrustScore) {
      return false;
    }

    // Check minimum trust level
    const agentLevelIndex = TRUST_LEVEL_ORDER.indexOf(trust.trustLevel);
    const requiredLevelIndex = TRUST_LEVEL_ORDER.indexOf(
      this.config.minTrustLevel
    );
    if (agentLevelIndex < requiredLevelIndex) {
      return false;
    }

    // Check sanctions status
    if (
      this.config.requireCleanSanctions &&
      trust.sanctionsStatus !== "CLEAR"
    ) {
      return false;
    }

    return {
      data: {
        agentTrust: trust,
      },
    };
  }

  getAuthError(): {
    status: number;
    message: string;
    headers?: Record<string, string>;
  } {
    return {
      status: 403,
      message: "Agent trust verification failed",
      headers: {
        "X-Trust-Required": `min-score=${this.config.minTrustScore},min-level=${this.config.minTrustLevel}`,
        "X-Trust-Info": "https://agentpass.co.uk",
      },
    };
  }

  /**
   * Extract agent ID from request headers
   */
  private extractAgentId(req: IncomingMessage): string | null {
    // Check custom header first
    const headerValue = req.headers[this.config.agentIdHeader];
    if (headerValue) {
      return Array.isArray(headerValue) ? headerValue[0] : headerValue;
    }

    // Check Authorization header for agent token
    const auth = req.headers.authorization;
    if (auth?.startsWith("Agent ")) {
      return auth.slice(6).trim();
    }

    // Check AgentPass passport ID header
    const passportId = req.headers["x-agent-passport-id"];
    if (passportId) {
      return Array.isArray(passportId) ? passportId[0] : passportId;
    }

    return null;
  }

  /**
   * Query AgentPass public trust API with caching
   */
  private async queryTrust(
    agentId: string
  ): Promise<AgentPassTrustResult | null> {
    // Check cache
    const cached = this.cache.get(agentId);
    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/trust/${encodeURIComponent(agentId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "mcp-framework-agentpass/1.0",
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const result: AgentPassTrustResult = {
        agent: (data.agent as string) ?? agentId,
        trustLevel: (data.trustLevel as string) ?? "L0",
        trustScore: (data.trustScore as number) ?? 0,
        identityVerified: (data.identityVerified as boolean) ?? false,
        sanctionsStatus: (data.sanctionsStatus as string) ?? "UNKNOWN",
        transactionCount: (data.transactionCount as number) ?? 0,
        registeredAt: data.registeredAt as string | undefined,
      };

      // Cache result
      this.cache.set(agentId, {
        result,
        expiry: Date.now() + this.config.cacheTtlMs,
      });

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Clear the trust score cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
