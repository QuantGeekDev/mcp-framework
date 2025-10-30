import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../core/Logger.js';

export interface FileDiscoveryOptions {
  extensions?: string[];
  excludePatterns?: string[];
  includeDirectories?: boolean;
}

/**
 * Recursively discovers files in a directory tree
 * @param rootPath - The root directory to start searching from
 * @param options - Configuration options for file discovery
 * @returns Array of file paths relative to the root path
 */
export async function discoverFilesRecursively(
  rootPath: string,
  options: FileDiscoveryOptions = {}
): Promise<string[]> {
  const { extensions = ['.js'], excludePatterns = [], includeDirectories = false } = options;

  const discoveredFiles: string[] = [];

  async function traverseDirectory(currentPath: string, relativePath: string = ''): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relativeFilePath = relativePath ? join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          if (includeDirectories) {
            discoveredFiles.push(relativeFilePath);
          }
          // Recursively traverse subdirectories
          await traverseDirectory(fullPath, relativeFilePath);
        } else if (entry.isFile()) {
          // Check if file has valid extension
          const hasValidExtension = extensions.some((ext) => entry.name.endsWith(ext));

          if (hasValidExtension) {
            // Check if file should be excluded
            const isExcluded = excludePatterns.some((pattern) => {
              if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace('*', '.*'));
                return regex.test(entry.name);
              }
              return entry.name === pattern;
            });

            if (!isExcluded) {
              discoveredFiles.push(relativeFilePath);
              logger.debug(`Discovered file: ${relativeFilePath}`);
            } else {
              logger.debug(`Excluded file: ${relativeFilePath}`);
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`Error reading directory ${currentPath}: ${(error as Error).message}`);
    }
  }

  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      logger.warn(`Path is not a directory: ${rootPath}`);
      return [];
    }

    await traverseDirectory(rootPath);
    logger.debug(`Discovered ${discoveredFiles.length} files in ${rootPath}`);
    return discoveredFiles;
  } catch (error) {
    logger.debug(`Directory not found: ${rootPath} - ${(error as Error).message}`);
    return [];
  }
}

/**
 * Checks if a directory exists and contains any valid files recursively
 * @param rootPath - The root directory to check
 * @param options - Configuration options for file discovery
 * @returns True if the directory contains valid files
 */
export async function hasValidFiles(
  rootPath: string,
  options: FileDiscoveryOptions = {}
): Promise<boolean> {
  try {
    const files = await discoverFilesRecursively(rootPath, options);
    return files.length > 0;
  } catch (error) {
    logger.debug(`Error checking for valid files in ${rootPath}: ${(error as Error).message}`);
    return false;
  }
}
