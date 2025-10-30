import { z } from "zod";

/**
 * Configuration options for image transport
 */
export interface ImageTransportOptions {
  maxSize: number;
  allowedMimeTypes: string[];
  compressionQuality?: number;
}

/**
 * Schema for image content validation
 */
export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string()
});

export type ImageContent = z.infer<typeof ImageContentSchema>;

/**
 * Default configuration for image transport
 */
export const DEFAULT_IMAGE_OPTIONS: ImageTransportOptions = {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  compressionQuality: 0.8
};

/**
 * Validates image content against transport options
 */
export function validateImageTransport(content: ImageContent, options: ImageTransportOptions = DEFAULT_IMAGE_OPTIONS): void {
  // Validate schema
  ImageContentSchema.parse(content);

  // Validate MIME type
  if (!options.allowedMimeTypes.includes(content.mimeType)) {
    throw new Error(`Unsupported image type: ${content.mimeType}. Allowed types: ${options.allowedMimeTypes.join(', ')}`);
  }

  // Validate base64 format
  if (!isBase64(content.data)) {
    throw new Error('Invalid base64 image data');
  }

  // Validate size
  const sizeInBytes = Buffer.from(content.data, 'base64').length;
  if (sizeInBytes > options.maxSize) {
    throw new Error(`Image size ${sizeInBytes} bytes exceeds maximum allowed size of ${options.maxSize} bytes`);
  }
}

/**
 * Prepares image content for transport
 * This function can be extended to handle compression, format conversion, etc.
 */
export function prepareImageForTransport(content: ImageContent, options: ImageTransportOptions = DEFAULT_IMAGE_OPTIONS): ImageContent {
  validateImageTransport(content, options);
  
  // For now, we just return the validated content
  // Future: implement compression, format conversion, etc.
  return content;
}

/**
 * Checks if a string is valid base64
 */
function isBase64(str: string): boolean {
  if (str === '' || str.trim() === '') {
    return false;
  }
  try {
    return btoa(atob(str)) === str;
  } catch (_error) {
    return false;
  }
}

/**
 * Gets the size of a base64 image in bytes
 */
export function getBase64ImageSize(base64String: string): number {
  return Buffer.from(base64String, 'base64').length;
}

/**
 * Utility type for messages containing image content
 */
export type MessageWithImage = {
  result?: {
    content?: Array<ImageContent | { type: string; [key: string]: unknown }>;
  };
  [key: string]: unknown;
};

/**
 * Checks if a message contains image content
 */
export function hasImageContent(message: unknown): message is MessageWithImage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as MessageWithImage;
  return Array.isArray(msg.result?.content) &&
    msg.result.content.some(item => item.type === 'image');
}
