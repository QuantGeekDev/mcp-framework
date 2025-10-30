import { IncomingMessage } from "node:http";
import jwt, { Algorithm } from "jsonwebtoken";
import { AuthProvider, AuthResult, DEFAULT_AUTH_ERROR } from "../types.js";
import { logger } from "../../core/Logger.js";

/**
 * Configuration options for JWT authentication
 */
export interface JWTConfig {
  /**
   * Secret key for verifying JWT tokens
   */
  secret: string;

  /**
   * Allowed JWT algorithms
   * @default ["HS256"]
   */
  algorithms?: Algorithm[];

  /**
   * Name of the header containing the JWT token
   * @default "Authorization"
   */
  headerName?: string;

  /**
   * Whether to require "Bearer" prefix in Authorization header
   * @default true
   */
  requireBearer?: boolean;
}

/**
 * JWT-based authentication provider
 */
export class JWTAuthProvider implements AuthProvider {
  private config: Required<JWTConfig>;

  constructor(config: JWTConfig) {
    this.config = {
      algorithms: ["HS256"],
      headerName: "Authorization",
      requireBearer: true,
      ...config
    };

    if (!this.config.secret) {
      throw new Error("JWT secret is required");
    }
  }

  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    const authHeader = req.headers[this.config.headerName.toLowerCase()];
    
    if (!authHeader || typeof authHeader !== "string") {
      return false;
    }

    let token = authHeader;
    if (this.config.requireBearer) {
      if (!authHeader.startsWith("Bearer ")) {
        return false;
      }
      token = authHeader.split(" ")[1];
    }

    try {
      const decoded = jwt.verify(token, this.config.secret, {
        algorithms: this.config.algorithms
      });

      return {
        data: typeof decoded === "object" ? decoded : { sub: decoded }
      };
    } catch (error) {
      logger.debug(`JWT verification failed: ${(error as Error).message}`);
      return false;
    }
  }

  getAuthError() {
    return {
      ...DEFAULT_AUTH_ERROR,
      message: "Invalid or expired JWT token"
    };
  }
}
