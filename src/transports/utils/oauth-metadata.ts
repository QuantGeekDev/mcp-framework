import { AuthConfig } from '../../auth/types.js';
import { OAuthAuthProvider } from '../../auth/providers/oauth.js';
import { ProtectedResourceMetadata } from '../../auth/metadata/protected-resource.js';
import { logger } from '../../core/Logger.js';

/**
 * Initialize OAuth Protected Resource metadata from auth configuration.
 * This creates a ProtectedResourceMetadata object that serves the
 * /.well-known/oauth-protected-resource endpoint per RFC 9728.
 *
 * @param authConfig - Authentication configuration from transport
 * @param transportType - Type of transport (for logging purposes)
 * @returns ProtectedResourceMetadata instance if OAuth is configured, undefined otherwise
 */
export function initializeOAuthMetadata(
  authConfig: AuthConfig | undefined,
  transportType: string
): ProtectedResourceMetadata | undefined {
  if (!authConfig?.provider) {
    return undefined;
  }

  if (!(authConfig.provider instanceof OAuthAuthProvider)) {
    return undefined;
  }

  const oauthProvider = authConfig.provider;

  const metadata = new ProtectedResourceMetadata({
    authorizationServers: oauthProvider.getAuthorizationServers(),
    resource: oauthProvider.getResource(),
  });

  logger.debug(`OAuth metadata endpoint enabled for ${transportType} transport`);

  return metadata;
}
