export { collectSourceFiles } from "./collect.js";
export { extractTools } from "./extract.js";
export {
  buildLockEntry,
  DEFAULT_LOCKFILE,
  diffEntries,
  LOCKFILE_VERSION,
  readLockfile,
  writeLockfile,
} from "./lock.js";
export type {
  LockDiff,
  LockEntry,
  Lockfile,
  LockedTool,
  ToolChange,
  ToolChangeType,
} from "./lock.js";
export { renderReport, renderVerifyReport, summarize } from "./report.js";
export { resolveTarget } from "./resolve.js";
export { loadRules } from "./rules.js";
export { analyze, computeGrade, loadServer, scan } from "./scan.js";
export type {
  Finding,
  Grade,
  Rule,
  ScanResult,
  Severity,
  ToolDescriptor,
} from "./types.js";
