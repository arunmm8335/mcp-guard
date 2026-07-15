import pc from "picocolors";
import type { LockDiff } from "./lock.js";
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

/**
 * Render the result of `verify`. `unlocked` lists targets present in the
 * lockfile that could not be re-resolved (network/removed), and `unpinned`
 * lists scanned targets not in the lockfile.
 */
export function renderVerifyReport(
  diffs: LockDiff[],
  errors: { target: string; message: string }[] = [],
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(pc.bold("mcpguard verify"));
  lines.push("");

  const changed = diffs.filter((d) => !d.clean);
  const clean = diffs.filter((d) => d.clean);

  for (const d of changed) {
    const rugPull = d.toolChanges.some(
      (c) => c.type === "modified" || c.type === "removed",
    );
    const header = rugPull
      ? pc.bgRed(pc.white(" RUG PULL "))
      : pc.yellow(" CHANGED  ");
    lines.push(`${header} ${pc.bold(d.target)}`);

    for (const c of d.toolChanges) {
      const verb =
        c.type === "modified"
          ? pc.red("tool description changed")
          : c.type === "removed"
            ? pc.red("tool removed")
            : pc.yellow("tool added");
      lines.push(`           ${verb}: ${pc.cyan(c.name)}`);
    }
    for (const f of d.filesModified) {
      lines.push(`           ${pc.red("code changed")}: ${pc.cyan(f)}`);
    }
    for (const f of d.filesAdded) {
      lines.push(`           ${pc.yellow("file added")}: ${pc.cyan(f)}`);
    }
    for (const f of d.filesRemoved) {
      lines.push(`           ${pc.yellow("file removed")}: ${pc.cyan(f)}`);
    }
    if (d.gradeChange) {
      const worse =
        "ABCDF".indexOf(d.gradeChange.to) > "ABCDF".indexOf(d.gradeChange.from);
      const arrow = `${d.gradeChange.from} -> ${d.gradeChange.to}`;
      lines.push(
        `           grade ${worse ? pc.red(arrow) : pc.yellow(arrow)}`,
      );
    }
    lines.push("");
  }

  for (const e of errors) {
    lines.push(`${pc.yellow(" SKIPPED  ")} ${pc.bold(e.target)}`);
    lines.push(`           ${pc.dim(e.message)}`);
    lines.push("");
  }

  if (clean.length > 0) {
    lines.push(pc.green(`${clean.length} server(s) unchanged since lock.`));
  }
  if (changed.length === 0 && errors.length === 0) {
    lines.push(pc.green("All locked servers match. No drift detected."));
  } else if (changed.length > 0) {
    lines.push(
      pc.red(
        `${changed.length} server(s) drifted from the lockfile. Review before trusting them.`,
      ),
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
