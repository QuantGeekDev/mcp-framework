import { ToolProtocol } from "../tools/BaseTool.js";
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

type ToolLoaderIssue = LoaderIssue;

type Stats = Awaited<ReturnType<typeof fs.stat>>;

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const isErrnoException = (cause: unknown): cause is NodeJS.ErrnoException =>
  typeof cause === "object" && cause !== null && "code" in cause;

export class ToolLoader {
  private readonly TOOLS_DIR: string;
  private readonly EXCLUDED_FILES = ["BaseTool.js", "*.test.js", "*.spec.js"];

  constructor(basePath?: string) {
    const mainModulePath = basePath || process.argv[1];
    this.TOOLS_DIR = join(dirname(mainModulePath), "tools");
    logger.debug(`Initialized ToolLoader with directory: ${this.TOOLS_DIR}`);
  }

  async hasTools(): Promise<boolean> {
    return Effect.runPromise(
      Effect.tapError(this.hasToolsEffect(), (error) =>
        Effect.sync(() =>
          logger.debug(
            `Unable to inspect tools directory ${error.path}: ${describeCause(error.cause)}`
          )
        )
      )
    );
  }

  private isToolFile(file: string): boolean {
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

  private validateTool(tool: any): tool is ToolProtocol {
    const isValid = Boolean(
      tool &&
        typeof tool.name === "string" &&
        tool.toolDefinition &&
        typeof tool.toolCall === "function"
    );

    if (isValid) {
      logger.debug(`Validated tool: ${tool.name}`);
    } else {
      logger.warn(`Invalid tool found: missing required properties`);
    }

    return isValid;
  }

  async loadTools(): Promise<ToolProtocol[]> {
    return Effect.runPromise(
      Effect.tapError(this.loadToolsEffect(), (error) =>
        Effect.sync(() =>
          logger.error(
            `Failed to read tools directory ${error.path}: ${describeCause(error.cause)}`
          )
        )
      )
    );
  }

  private hasToolsEffect(): Effect.Effect<boolean, DirectoryAccessError> {
    const directory = this.TOOLS_DIR;
    const statDirectory = this.statDirectory;
    const readDirectory = this.readDirectory;
    const isToolFile = this.isToolFile.bind(this);

    return Effect.gen(function* () {
      const statResult = yield* Effect.either(statDirectory(directory));

      if (Either.isLeft(statResult)) {
        const error = statResult.left;
        if (error._tag === "DirectoryMissingError") {
          yield* Effect.sync(() =>
            logger.debug(`No tools directory found: ${directory}`)
          );
          return false;
        }
        return yield* Effect.fail(error);
      }

      const stats = statResult.right;
      if (!stats.isDirectory()) {
        yield* Effect.sync(() =>
          logger.debug("Tools path exists but is not a directory")
        );
        return false;
      }

      const files = yield* readDirectory(directory);
      const hasValidFiles = files.some(isToolFile);

      yield* Effect.sync(() =>
        logger.debug(`Tools directory has valid files: ${hasValidFiles}`)
      );

      return hasValidFiles;
    });
  }

  private loadToolsEffect(): Effect.Effect<ToolProtocol[], DirectoryAccessError> {
    const directory = this.TOOLS_DIR;
    const statDirectory = this.statDirectory;
    const readDirectory = this.readDirectory;
    const loadToolFromFile = this.loadToolFromFile.bind(this);
    const logToolLoadIssue = this.logToolLoadIssue;

    return Effect.gen(function* () {
      yield* Effect.sync(() =>
        logger.debug(`Attempting to load tools from: ${directory}`)
      );

      const statResult = yield* Effect.either(statDirectory(directory));

      if (Either.isLeft(statResult)) {
        const error = statResult.left;
        if (error._tag === "DirectoryMissingError") {
          yield* Effect.sync(() =>
            logger.debug(`No tools directory found: ${directory}`)
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

      const tools: ToolProtocol[] = [];

      for (const file of files) {
        const loadResult = yield* Effect.either(loadToolFromFile(file));
        if (Either.isLeft(loadResult)) {
          yield* Effect.sync(() => logToolLoadIssue(loadResult.left));
          continue;
        }

        const toolOption = loadResult.right;
        if (Option.isSome(toolOption)) {
          tools.push(toolOption.value);
        }
      }

      yield* Effect.sync(() =>
        logger.debug(
          `Successfully loaded ${tools.length} tools: ${tools
            .map((t) => t.name)
            .join(", ")}`
        )
      );

      return tools;
    });
  }

  private loadToolFromFile(file: string): Effect.Effect<Option.Option<ToolProtocol>, ToolLoaderIssue> {
    if (!this.isToolFile(file)) {
      return Effect.succeed(Option.none<ToolProtocol>());
    }

    const fullPath = join(this.TOOLS_DIR, file);
    const importModule = this.importModule;
    const validateTool = this.validateTool.bind(this);

    return Effect.gen(function* () {
      yield* Effect.sync(() =>
        logger.debug(`Attempting to load tool from: ${fullPath}`)
      );

      const module = yield* importModule(fullPath);
      const ToolClass = (module as { default?: new () => ToolProtocol }).default;

      if (!ToolClass) {
        return yield* Effect.fail(
          new InvalidExportError({ path: fullPath, entityType: "tool" })
        );
      }

      const tool = new ToolClass();
      if (!validateTool(tool)) {
        return yield* Effect.fail(
          new InvalidDefinitionError({
            path: fullPath,
            entityType: "tool",
            reason: "Missing required properties",
          })
        );
      }

      return Option.some(tool);
    });
  }

  private logToolLoadIssue(issue: ToolLoaderIssue) {
    switch (issue._tag) {
      case "ModuleImportError":
        logger.error(
          `Error loading tool at ${issue.path}: ${describeCause(issue.cause)}`
        );
        break;
      case "InvalidExportError":
        logger.warn(`No default export found for tool at ${issue.path}`);
        break;
      case "InvalidDefinitionError":
        logger.warn(
          `Invalid tool definition at ${issue.path}: ${issue.reason}`
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
