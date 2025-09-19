import { ResourceProtocol } from "../resources/BaseResource.js";
import { join, dirname } from "path";
import { promises as fs } from "fs";
import { Effect, Either, Option } from "effect";
import {
  DirectoryAccessError,
  DirectoryMissingError,
  InvalidDefinitionError,
  InvalidExportError,
  ModuleImportError,
  type LoaderIssue,
} from "./errors.js";
import { logger } from "../core/Logger.js";

type ResourceLoaderIssue = LoaderIssue;

type Stats = Awaited<ReturnType<typeof fs.stat>>;

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const isErrnoException = (cause: unknown): cause is NodeJS.ErrnoException =>
  typeof cause === "object" && cause !== null && "code" in cause;

export class ResourceLoader {
  private readonly RESOURCES_DIR: string;
  private readonly EXCLUDED_FILES = [
    "BaseResource.js",
    "*.test.js",
    "*.spec.js",
  ];

  constructor(basePath?: string) {
    const mainModulePath = basePath || process.argv[1];
    this.RESOURCES_DIR = join(dirname(mainModulePath), "resources");
    logger.debug(
      `Initialized ResourceLoader with directory: ${this.RESOURCES_DIR}`
    );
  }

  async hasResources(): Promise<boolean> {
    return Effect.runPromise(
      Effect.tapError(this.hasResourcesEffect(), (error) =>
        Effect.sync(() =>
          logger.debug(
            `Unable to inspect resources directory ${error.path}: ${describeCause(error.cause)}`
          )
        )
      )
    );
  }

  private isResourceFile(file: string): boolean {
    if (!file.endsWith(".js")) return false;
    const isExcluded = this.EXCLUDED_FILES.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace("*", ".*"));
        return regex.test(file);
      }
      return file === pattern;
    });

    logger.debug(
      `Checking file ${file}: ${isExcluded ? "excluded" : "included"}`
    );
    return !isExcluded;
  }

  private validateResource(resource: any): resource is ResourceProtocol {
    const isValid = Boolean(
      resource &&
        typeof resource.uri === "string" &&
        typeof resource.name === "string" &&
        resource.resourceDefinition &&
        typeof resource.read === "function"
    );

    if (isValid) {
      logger.debug(`Validated resource: ${resource.name}`);
    } else {
      logger.warn(`Invalid resource found: missing required properties`);
    }

    return isValid;
  }

  async loadResources(): Promise<ResourceProtocol[]> {
    return Effect.runPromise(
      Effect.tapError(this.loadResourcesEffect(), (error) =>
        Effect.sync(() =>
          logger.error(
            `Failed to read resources directory ${error.path}: ${describeCause(error.cause)}`
          )
        )
      )
    );
  }

  private hasResourcesEffect(): Effect.Effect<boolean, DirectoryAccessError> {
    const directory = this.RESOURCES_DIR;
    const statDirectory = this.statDirectory;
    const readDirectory = this.readDirectory;
    const isResourceFile = this.isResourceFile.bind(this);

    return Effect.gen(function* () {
      const statResult = yield* Effect.either(statDirectory(directory));

      if (Either.isLeft(statResult)) {
        const error = statResult.left;
        if (error._tag === "DirectoryMissingError") {
          yield* Effect.sync(() =>
            logger.debug(`No resources directory found: ${directory}`)
          );
          return false;
        }
        return yield* Effect.fail(error);
      }

      const stats = statResult.right;
      if (!stats.isDirectory()) {
        yield* Effect.sync(() =>
          logger.debug("Resources path exists but is not a directory")
        );
        return false;
      }

      const files = yield* readDirectory(directory);
      const hasValidFiles = files.some(isResourceFile);

      yield* Effect.sync(() =>
        logger.debug(`Resources directory has valid files: ${hasValidFiles}`)
      );

      return hasValidFiles;
    });
  }

  private loadResourcesEffect(): Effect.Effect<ResourceProtocol[], DirectoryAccessError> {
    const directory = this.RESOURCES_DIR;
    const statDirectory = this.statDirectory;
    const readDirectory = this.readDirectory;
    const loadResourceFromFile = this.loadResourceFromFile.bind(this);
    const logResourceLoadIssue = this.logResourceLoadIssue;

    return Effect.gen(function* () {
      yield* Effect.sync(() =>
        logger.debug(`Attempting to load resources from: ${directory}`)
      );

      const statResult = yield* Effect.either(statDirectory(directory));

      if (Either.isLeft(statResult)) {
        const error = statResult.left;
        if (error._tag === "DirectoryMissingError") {
          yield* Effect.sync(() =>
            logger.debug(`No resources directory found: ${directory}`)
          );
          return [];
        }
        return yield* Effect.fail(error);
      }

      const stats = statResult.right;
      if (!stats.isDirectory()) {
        yield* Effect.sync(() =>
          logger.error(`Path is not a directory: ${directory}`)
        );
        return [];
      }

      const files = yield* readDirectory(directory);
      yield* Effect.sync(() =>
        logger.debug(`Found files in directory: ${files.join(", ")}`)
      );

      const resources: ResourceProtocol[] = [];

      for (const file of files) {
        const loadResult = yield* Effect.either(loadResourceFromFile(file));
        if (Either.isLeft(loadResult)) {
          yield* Effect.sync(() => logResourceLoadIssue(loadResult.left));
          continue;
        }

        const resourceOption = loadResult.right;
        if (Option.isSome(resourceOption)) {
          resources.push(resourceOption.value);
        }
      }

      yield* Effect.sync(() =>
        logger.debug(
          `Successfully loaded ${resources.length} resources: ${resources
            .map((r) => r.name)
            .join(", ")}`
        )
      );

      return resources;
    });
  }

  private loadResourceFromFile(file: string): Effect.Effect<Option.Option<ResourceProtocol>, ResourceLoaderIssue> {
    if (!this.isResourceFile(file)) {
      return Effect.succeed(Option.none<ResourceProtocol>());
    }

    const fullPath = join(this.RESOURCES_DIR, file);
    const importModule = this.importModule;
    const validateResource = this.validateResource.bind(this);

    return Effect.gen(function* () {
      yield* Effect.sync(() =>
        logger.debug(`Attempting to load resource from: ${fullPath}`)
      );

      const module = yield* importModule(fullPath);
      const ResourceClass = (module as { default?: new () => ResourceProtocol }).default;

      if (!ResourceClass) {
        return yield* Effect.fail(
          new InvalidExportError({ path: fullPath, entityType: "resource" })
        );
      }

      const resource = new ResourceClass();
      if (!validateResource(resource)) {
        return yield* Effect.fail(
          new InvalidDefinitionError({
            path: fullPath,
            entityType: "resource",
            reason: "Missing required properties",
          })
        );
      }

      return Option.some(resource);
    });
  }

  private logResourceLoadIssue(issue: ResourceLoaderIssue) {
    switch (issue._tag) {
      case "ModuleImportError":
        logger.error(
          `Error loading resource at ${issue.path}: ${describeCause(issue.cause)}`
        );
        break;
      case "InvalidExportError":
        logger.warn(`No default export found for resource at ${issue.path}`);
        break;
      case "InvalidDefinitionError":
        logger.warn(
          `Invalid resource definition at ${issue.path}: ${issue.reason}`
        );
        break;
    }
  }

  private statDirectory = (
    path: string
  ): Effect.Effect<Stats, DirectoryMissingError | DirectoryAccessError> =>
    Effect.tryPromise({
      try: () => fs.stat(path),
      catch: (cause) =>
        isErrnoException(cause) && cause.code === "ENOENT"
          ? new DirectoryMissingError({ path })
          : new DirectoryAccessError({ path, cause }),
    });

  private readDirectory = (
    path: string
  ): Effect.Effect<string[], DirectoryAccessError> =>
    Effect.tryPromise({
      try: () => fs.readdir(path),
      catch: (cause) => new DirectoryAccessError({ path, cause }),
    });

  private importModule = (fullPath: string): Effect.Effect<unknown, ModuleImportError> => {
    const importPath = `file://${fullPath}`;
    return Effect.tryPromise({
      try: () => import(importPath),
      catch: (cause) => new ModuleImportError({ path: fullPath, cause }),
    });
  };
}
