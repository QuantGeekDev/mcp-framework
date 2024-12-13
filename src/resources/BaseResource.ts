export type ResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

export type ResourceDefinition = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};

export type ResourceTemplateDefinition = {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
};

export type ResourceCompletion = {
  values: string[];
  total?: number;
  hasMore?: boolean;
};

export interface ResourceProtocol<TArgs extends Record<string, any> = {}> {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  resourceDefinition: ResourceDefinition;
  templateDefinition?: ResourceTemplateDefinition;
  read(): Promise<ResourceContent[]>;
  subscribe?(): Promise<void>;
  unsubscribe?(): Promise<void>;
  complete?<K extends keyof TArgs & string>(
    argumentName: K,
    value: TArgs[K],
  ): Promise<ResourceCompletion>;
}

export abstract class MCPResource<TArgs extends Record<string, any> = {}>
  implements ResourceProtocol<TArgs>
{
  abstract uri: string;
  abstract name: string;
  description?: string;
  mimeType?: string;
  protected template?: {
    uriTemplate: string;
    description?: string;
  };

  get resourceDefinition(): ResourceDefinition {
    return {
      uri: this.uri,
      name: this.name,
      description: this.description,
      mimeType: this.mimeType,
    };
  }

  get templateDefinition(): ResourceTemplateDefinition | undefined {
    if (!this.template) {
      return undefined;
    }

    return {
      uriTemplate: this.template.uriTemplate,
      name: this.name,
      description: this.template.description ?? this.description,
      mimeType: this.mimeType,
    };
  }

  abstract read(): Promise<ResourceContent[]>;

  async subscribe?(): Promise<void> {
    throw new Error("Subscription not implemented for this resource");
  }

  async unsubscribe?(): Promise<void> {
    throw new Error("Unsubscription not implemented for this resource");
  }

  async complete?(
    argument: string,
    value: string,
  ): Promise<ResourceCompletion> {
    return {
      values: [],
      total: 0,
      hasMore: false,
    };
  }

  protected async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}
