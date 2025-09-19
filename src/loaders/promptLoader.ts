import { PromptProtocol } from "../prompts/BasePrompt.js";
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

type PromptLoaderIssue = LoaderIssue;

type Stats = Awaited<ReturnType<typeof fs.stat>>;

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const isErrnoException = (cause: unknown): cause is NodeJS.ErrnoException =>
  typeof cause === "object" && cause !== null && "code" in cause;

export class PromptLoader {
  private readonly PROMPTS_DIR: string;
  private readonly EXCLUDED_FILES = ["BasePrompt.js", "*.test.js", "*.spec.js"];

  constructor(basePath?: string) {
    const mainModulePath = basePath || process.argv[1];
    this.PROMPTS_DIR = join(dirname(mainModulePath), "prompts");
    logger.debug(
      `Initialized PromptLoader with directory: ${this.PROMPTS_DIR}`
    );
  }

  async hasPrompts(): Promise<boolean> {
    return Effect.runPromise(
      Effect.tapError(this.hasPromptsEffect(), (error) =>
        Effect.sync(() =>
          logger.debug(
            `Unable to inspect prompts directory ${error.path}: ${describeCause(error.cause)}`
          )
        )
      )
    );
  }

  private isPromptFile(file: string): boolean {
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

  private validatePrompt(prompt: any): prompt is PromptProtocol {
    const isValid = Boolean(
      prompt &&
        typeof prompt.name === "string" &&
        prompt.promptDefinition &&
        typeof prompt.getMessages === "function"
    );

    if (isValid) {
      logger.debug(`Validated prompt: ${prompt.name}`);
    } else {
      logger.warn(`Invalid prompt found: missing required properties`);
    }

    return isValid;
  }

  async loadPrompts(): Promise<PromptProtocol[]> {
    return Effect.runPromise(
      Effect.tapError(this.loadPromptsEffect(), (error) =>
        Effect.sync(() =>
          logger.error(
            `Failed to read prompts directory ${error.path}: ${describeCause(error.cause)}`
          )
        )
      )
    );
  }

  private hasPromptsEffect(): Effect.Effect<boolean, DirectoryAccessError> {
    const directory = this.PROMPTS_DIR;
    const statDirectory = this.statDirectory;
    const readDirectory = this.readDirectory;
    const isPromptFile = this.isPromptFile.bind(this);

    return Effect.gen(function* () {
      const statResult = yield* Effect.either(statDirectory(directory));

      if (Either.isLeft(statResult)) {
        const error = statResult.left;
        if (error._tag === "DirectoryMissingError") {
          yield* Effect.sync(() =>
            logger.debug(`No prompts directory found: ${directory}`)
          );
          return false;
        }
        return yield* Effect.fail(error);
      }

      const stats = statResult.right;
      if (!stats.isDirectory()) {
        yield* Effect.sync(() =>
          logger.debug("Prompts path exists but is not a directory")
        );
        return false;
      }

      const files = yield* readDirectory(directory);
      const hasValidFiles = files.some(isPromptFile);

      yield* Effect.sync(() =>
        logger.debug(`Prompts directory has valid files: ${hasValidFiles}`)
      );

      return hasValidFiles;
    });
  }

  private loadPromptsEffect(): Effect.Effect<PromptProtocol[], DirectoryAccessError> {
    const directory = this.PROMPTS_DIR;
    const statDirectory = this.statDirectory;
    const readDirectory = this.readDirectory;
    const loadPromptFromFile = this.loadPromptFromFile.bind(this);
    const logPromptLoadIssue = this.logPromptLoadIssue;

    return Effect.gen(function* () {
      yield* Effect.sync(() =>
        logger.debug(`Attempting to load prompts from: ${directory}`)
      );

      const statResult = yield* Effect.either(statDirectory(directory));

      if (Either.isLeft(statResult)) {
        const error = statResult.left;
        if (error._tag === "DirectoryMissingError") {
          yield* Effect.sync(() =>
            logger.debug(`No prompts directory found: ${directory}`)
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

      const prompts: PromptProtocol[] = [];

      for (const file of files) {
        const loadResult = yield* Effect.either(loadPromptFromFile(file));
        if (Either.isLeft(loadResult)) {
          yield* Effect.sync(() => logPromptLoadIssue(loadResult.left));
          continue;
        }

        const promptOption = loadResult.right;
        if (Option.isSome(promptOption)) {
          prompts.push(promptOption.value);
        }
      }

      yield* Effect.sync(() =>
        logger.debug(
          `Successfully loaded ${prompts.length} prompts: ${prompts
            .map((p) => p.name)
            .join(", ")}`
        )
      );

      return prompts;
    });
  }

  private loadPromptFromFile(file: string): Effect.Effect<Option.Option<PromptProtocol>, PromptLoaderIssue> {
    if (!this.isPromptFile(file)) {
      return Effect.succeed(Option.none<PromptProtocol>());
    }

    const fullPath = join(this.PROMPTS_DIR, file);
    const importModule = this.importModule;
    const validatePrompt = this.validatePrompt.bind(this);

    return Effect.gen(function* () {
      yield* Effect.sync(() =>
        logger.debug(`Attempting to load prompt from: ${fullPath}`)
      );

      const module = yield* importModule(fullPath);
      const PromptClass = (module as { default?: new () => PromptProtocol }).default;

      if (!PromptClass) {
        return yield* Effect.fail(
          new InvalidExportError({ path: fullPath, entityType: "prompt" })
        );
      }

      const prompt = new PromptClass();
      if (!validatePrompt(prompt)) {
        return yield* Effect.fail(
          new InvalidDefinitionError({
            path: fullPath,
            entityType: "prompt",
            reason: "Missing required properties",
          })
        );
      }

      return Option.some(prompt);
    });
  }

  private logPromptLoadIssue(issue: PromptLoaderIssue) {
    switch (issue._tag) {
      case "ModuleImportError":
        logger.error(
          `Error loading prompt at ${issue.path}: ${describeCause(issue.cause)}`
        );
        break;
      case "InvalidExportError":
        logger.warn(`No default export found for prompt at ${issue.path}`);
        break;
      case "InvalidDefinitionError":
        logger.warn(
          `Invalid prompt definition at ${issue.path}: ${issue.reason}`
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
