export type Severity = "critical" | "high" | "medium" | "low";

export type RuleContext = "tool-description" | "code";

export interface Rule {
  id: string;
  name: string;
  category: string;
  severity: Severity;
  description: string;
  /** Regex source, applied case-insensitively unless `caseSensitive` is set. */
  pattern: string;
  caseSensitive?: boolean;
  context: RuleContext;
  /** File extensions this rule applies to (code rules only), e.g. [".ts", ".py"]. */
  extensions?: string[];
  /** When true, a single match forces an F grade regardless of score. */
  disqualifying?: boolean;
}

export interface Finding {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: Severity;
  message: string;
  file: string;
  line: number;
  /** The matched text, truncated for display. */
  evidence: string;
  /** When true, this finding alone forces an F grade. */
  disqualifying?: boolean;
}

export interface ToolDescriptor {
  /** Best-effort tool name; may be empty when only a description was found. */
  name: string;
  description: string;
  file: string;
  line: number;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ScanResult {
  target: string;
  resolvedPath: string;
  filesScanned: number;
  tools: ToolDescriptor[];
  findings: Finding[];
  score: number;
  grade: Grade;
}
