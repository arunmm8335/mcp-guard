import pc from "picocolors";
import type { Finding, ScanResult, Severity } from "./types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function severityLabel(severity: Severity): string {
  switch (severity) {
    case "critical":
      return pc.bgRed(pc.white(" CRITICAL "));
    case "high":
      return pc.red("   HIGH   ");
    case "medium":
      return pc.yellow("  MEDIUM  ");
    case "low":
      return pc.dim("   LOW    ");
  }
}

function gradeColor(grade: string): string {
  if (grade === "A") return pc.green(grade);
  if (grade === "B") return pc.green(grade);
  if (grade === "C") return pc.yellow(grade);
  return pc.red(grade);
}

export function renderReport(result: ScanResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(pc.bold(`mcpguard scan: ${result.target}`));
  lines.push(
    pc.dim(
      `${result.filesScanned} files scanned · ${result.tools.length} tools found · ${result.findings.length} findings`,
    ),
  );
  lines.push("");

  if (result.findings.length === 0) {
    lines.push(pc.green("No findings."));
  } else {
    const sorted = [...result.findings].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    for (const f of sorted) {
      lines.push(
        `${severityLabel(f.severity)} ${pc.bold(f.ruleId)} ${f.ruleName} ${pc.dim(`(${f.category})`)}`,
      );
      lines.push(`           ${f.message}`);
      lines.push(`           ${pc.cyan(`${f.file}:${f.line}`)}`);
      lines.push(`           ${pc.dim(`match: ${f.evidence}`)}`);
      lines.push("");
    }
  }

  lines.push(
    pc.bold(`Grade: ${gradeColor(result.grade)}`) +
      pc.dim(`  (score ${result.score}/100)`),
  );
  if (result.grade === "F" || result.grade === "D") {
    lines.push(
      pc.red("Do not install this server without a manual security review."),
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function summarize(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
