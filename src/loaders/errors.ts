import { Data } from "effect";

export class DirectoryMissingError extends Data.TaggedError(
  "DirectoryMissingError"
)<{ path: string }> {}

export class DirectoryAccessError extends Data.TaggedError(
  "DirectoryAccessError"
)<{ path: string; cause: unknown }> {}

export class ModuleImportError extends Data.TaggedError(
  "ModuleImportError"
)<{ path: string; cause: unknown }> {}

export class InvalidExportError extends Data.TaggedError(
  "InvalidExportError"
)<{ path: string; entityType: string }> {}

export class InvalidDefinitionError extends Data.TaggedError(
  "InvalidDefinitionError"
)<{ path: string; entityType: string; reason: string }> {}

export type DirectoryError = DirectoryMissingError | DirectoryAccessError;
export type LoaderIssue =
  | ModuleImportError
  | InvalidExportError
  | InvalidDefinitionError;
