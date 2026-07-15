import { collectSourceFiles, type SourceFile } from "./collect.js";
import { extractTools } from "./extract.js";
import { resolveTarget } from "./resolve.js";
import { loadRules, type CompiledRule } from "./rules.js";
import type { Finding, Grade, ScanResult, ToolDescriptor } from "./types.js";

const SEVERITY_WEIGHT = { critical: 25, high: 12, medium: 5, low: 2 } as const;

const EVIDENCE_MAX = 160;

export interface LoadedServer {
  /** Local directory the source was resolved to. */
  resolvedPath: string;
  files: SourceFile[];
}

/**
 * Resolve a target and read its source files. Separated from {@link analyze}
 * so callers (e.g. `lock`/`verify`) can resolve once and both scan and hash
 * the same file set without cloning or unpacking twice.
 */
export function loadServer(target: string): LoadedServer {
  const resolved = resolveTarget(target);
  const files = collectSourceFiles(resolved.path);
  return { resolvedPath: resolved.path, files };
}

/** Run the rule packs over an already-loaded file set and grade the result. */
export function analyze(
  target: string,
  resolvedPath: string,
  files: SourceFile[],
  rulesDir?: string,
): ScanResult {
  const rules = loadRules(rulesDir);
  const tools = extractTools(files);

  const findings: Finding[] = [
    ...scanToolDescriptions(tools, rules),
    ...scanCode(files, rules),
  ];

  const { score, grade } = computeGrade(findings);
  return {
    target,
    resolvedPath,
    filesScanned: files.length,
    tools,
    findings,
    score,
    grade,
  };
}

export function scan(target: string, rulesDir?: string): ScanResult {
  const { resolvedPath, files } = loadServer(target);
  return analyze(target, resolvedPath, files, rulesDir);
}

function scanToolDescriptions(
  tools: ToolDescriptor[],
  rules: CompiledRule[],
): Finding[] {
  const descriptionRules = rules.filter((r) => r.context === "tool-description");
  const findings: Finding[] = [];
  for (const tool of tools) {
    for (const rule of descriptionRules) {
      const match = rule.regex.exec(tool.description);
      if (!match) continue;
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        severity: rule.severity,
        message: `Tool "${tool.name || "(unnamed)"}": ${rule.description}`,
        file: tool.file,
        line: tool.line,
        evidence: truncate(match[0]),
      });
    }
  }
  return findings;
}

function scanCode(files: SourceFile[], rules: CompiledRule[]): Finding[] {
  const codeRules = rules.filter((r) => r.context === "code");
  const findings: Finding[] = [];
  for (const file of files) {
    const ext = file.path.slice(file.path.lastIndexOf("."));
    const applicable = codeRules.filter(
      (r) => !r.extensions || r.extensions.includes(ext),
    );
    if (applicable.length === 0) continue;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const rule of applicable) {
        const match = rule.regex.exec(lines[i]);
        if (!match) continue;
        if (isInComment(lines[i], match.index ?? 0, ext)) continue;
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          severity: rule.severity,
          message: rule.description,
          file: file.path,
          line: i + 1,
          evidence: truncate(match[0]),
        });
      }
    }
  }
  return findings;
}

const HASH_COMMENT_EXT = new Set([".py", ".sh"]);

/**
 * Heuristic: is the match inside a comment? Commented-out code doesn't
 * execute, so flagging a `// eval(...)` line is a false positive. Handles
 * line comments (`//`, `#`) and block-comment continuation lines (`*`, `/*`).
 */
function isInComment(line: string, matchIndex: number, ext: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;
  const commentStart = HASH_COMMENT_EXT.has(ext)
    ? line.indexOf("#")
    : findSlashComment(line);
  return commentStart !== -1 && commentStart <= matchIndex;
}

/** Index of a `//` line comment, ignoring the `//` inside `://` (URLs). */
function findSlashComment(line: string): number {
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === "/" && line[i + 1] === "/" && line[i - 1] !== ":") return i;
  }
  return -1;
}

export function computeGrade(findings: Finding[]): {
  score: number;
  grade: Grade;
} {
  let penalty = 0;
  for (const f of findings) penalty += SEVERITY_WEIGHT[f.severity];
  const score = Math.max(0, 100 - penalty);

  // Any tool-poisoning critical is an automatic F: the server is actively
  // trying to manipulate the agent, which is disqualifying regardless of score.
  const poisoned = findings.some(
    (f) => f.category === "tool-poisoning" && f.severity === "critical",
  );
  const grade: Grade = poisoned
    ? "F"
    : score >= 90
      ? "A"
      : score >= 75
        ? "B"
        : score >= 60
          ? "C"
          : score >= 40
            ? "D"
            : "F";
  return { score, grade };
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > EVIDENCE_MAX ? clean.slice(0, EVIDENCE_MAX) + "…" : clean;
}
