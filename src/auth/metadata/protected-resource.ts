import { ServerResponse } from 'node:http';
import { logger } from '../../core/Logger.js';

export interface OAuthMetadataConfig {
  authorizationServers: string[];
  resource: string;
}

export interface ProtectedResourceMetadataResponse {
  resource: string;
  authorization_servers: string[];
}

export class ProtectedResourceMetadata {
  private config: OAuthMetadataConfig;
  private metadataJson: string;

  constructor(config: OAuthMetadataConfig) {
    if (!config.resource || config.resource.trim() === '') {
      throw new Error('OAuth metadata requires a resource identifier');
    }

    if (!config.authorizationServers || config.authorizationServers.length === 0) {
      throw new Error('OAuth metadata requires at least one authorization server');
    }

    for (const server of config.authorizationServers) {
      if (!server || server.trim() === '') {
        throw new Error('Authorization server URL cannot be empty');
      }

      try {
        new URL(server);
      } catch {
        throw new Error(`Invalid authorization server URL: ${server}`);
      }
    }

    this.config = config;

    const metadata = this.generateMetadata();
    this.metadataJson = JSON.stringify(metadata, null, 2);

    logger.debug(
      `ProtectedResourceMetadata initialized - resource: ${this.config.resource}, servers: ${this.config.authorizationServers.length}`
    );
  }

  generateMetadata(): ProtectedResourceMetadataResponse {
    return {
      resource: this.config.resource,
      authorization_servers: this.config.authorizationServers,
    };
  }

  toJSON(): string {
    return this.metadataJson;
  }

  serve(res: ServerResponse): void {
    logger.debug('Serving OAuth Protected Resource Metadata');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.writeHead(200);
    res.end(this.metadataJson);
  }
}
