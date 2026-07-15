import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SourceFile } from "./collect.js";
import type { Grade, ScanResult } from "./types.js";

export const LOCKFILE_VERSION = 1 as const;
export const DEFAULT_LOCKFILE = "mcpguard.lock.json";

/** A single tool's identity at lock time. */
export interface LockedTool {
  name: string;
  file: string;
  line: number;
  /** Hash of the exact description text an agent was approved to trust. */
  descriptionSha: string;
}

/** Pinned state of one server, captured when it was approved. */
export interface LockEntry {
  target: string;
  lockedAt: string;
  grade: Grade;
  score: number;
  findingsCount: number;
  /** Digest over all tool identities — changes on any tool add/remove/edit. */
  toolsDigest: string;
  /** Digest over all source file hashes — changes on any code edit. */
  codeDigest: string;
  tools: LockedTool[];
  /** Relative path -> sha256 of file contents. */
  files: Record<string, string>;
}

export interface Lockfile {
  version: typeof LOCKFILE_VERSION;
  generatedAt: string;
  servers: Record<string, LockEntry>;
}

export type ToolChangeType = "added" | "removed" | "modified";

export interface ToolChange {
  type: ToolChangeType;
  name: string;
}

export interface LockDiff {
  target: string;
  /** True when nothing changed since lock time. */
  clean: boolean;
  toolChanges: ToolChange[];
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  gradeChange?: { from: Grade; to: Grade };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Build a pinnable entry from a scan result and its source files. */
export function buildLockEntry(
  result: ScanResult,
  files: SourceFile[],
): LockEntry {
  const fileDigests: Record<string, string> = {};
  for (const f of files) fileDigests[f.path] = sha256(f.content);

  const tools: LockedTool[] = result.tools
    .map((t) => ({
      name: t.name,
      file: t.file,
      line: t.line,
      descriptionSha: sha256(t.description),
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line,
    );

  const toolsDigest = sha256(
    JSON.stringify(
      tools.map((t) => [t.name, t.file, t.descriptionSha]),
    ),
  );
  const codeDigest = sha256(
    JSON.stringify(
      Object.keys(fileDigests)
        .sort()
        .map((p) => [p, fileDigests[p]]),
    ),
  );

  return {
    target: result.target,
    lockedAt: new Date().toISOString(),
    grade: result.grade,
    score: result.score,
    findingsCount: result.findings.length,
    toolsDigest,
    codeDigest,
    tools,
    files: fileDigests,
  };
}

export function readLockfile(path: string): Lockfile {
  if (!existsSync(path)) {
    return { version: LOCKFILE_VERSION, generatedAt: "", servers: {} };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Lockfile;
  if (parsed.version !== LOCKFILE_VERSION) {
    throw new Error(
      `Lockfile ${path} has version ${parsed.version}; expected ${LOCKFILE_VERSION}.`,
    );
  }
  return parsed;
}

export function writeLockfile(path: string, lockfile: Lockfile): void {
  writeFileSync(path, JSON.stringify(lockfile, null, 2) + "\n");
}

/**
 * Compare the approved (locked) entry with a freshly built one.
 *
 * A changed tool description is the rug-pull signal: the metadata the agent
 * trusts was silently altered after approval.
 */
export function diffEntries(locked: LockEntry, current: LockEntry): LockDiff {
  const toolChanges: ToolChange[] = [];
  const lockedTools = new Map(locked.tools.map((t) => [t.name, t]));
  const currentTools = new Map(current.tools.map((t) => [t.name, t]));

  for (const [name, cur] of currentTools) {
    const prev = lockedTools.get(name);
    if (!prev) {
      toolChanges.push({ type: "added", name });
    } else if (prev.descriptionSha !== cur.descriptionSha) {
      toolChanges.push({ type: "modified", name });
    }
  }
  for (const name of lockedTools.keys()) {
    if (!currentTools.has(name)) toolChanges.push({ type: "removed", name });
  }

  const filesAdded: string[] = [];
  const filesRemoved: string[] = [];
  const filesModified: string[] = [];
  const lockedFiles = locked.files;
  const currentFiles = current.files;
  for (const path of Object.keys(currentFiles)) {
    if (!(path in lockedFiles)) filesAdded.push(path);
    else if (lockedFiles[path] !== currentFiles[path]) filesModified.push(path);
  }
  for (const path of Object.keys(lockedFiles)) {
    if (!(path in currentFiles)) filesRemoved.push(path);
  }

  const gradeChange =
    locked.grade !== current.grade
      ? { from: locked.grade, to: current.grade }
      : undefined;

  const clean =
    toolChanges.length === 0 &&
    filesAdded.length === 0 &&
    filesRemoved.length === 0 &&
    filesModified.length === 0 &&
    !gradeChange;

  return {
    target: locked.target,
    clean,
    toolChanges,
    filesAdded: filesAdded.sort(),
    filesRemoved: filesRemoved.sort(),
    filesModified: filesModified.sort(),
    gradeChange,
  };
}
