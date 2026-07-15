#!/usr/bin/env node
import { Command } from "commander";
import {
  buildLockEntry,
  DEFAULT_LOCKFILE,
  diffEntries,
  LOCKFILE_VERSION,
  readLockfile,
  writeLockfile,
  type LockDiff,
  type Lockfile,
} from "./lock.js";
import { renderReport, renderVerifyReport } from "./report.js";
import { analyze, loadServer, scan } from "./scan.js";

const program = new Command();

program
  .name("mcpguard")
  .description(
    "Security scanner for MCP servers — detect tool poisoning, malicious code patterns, and supply-chain risks before your AI agents execute them.",
  )
  .version("0.1.0");

program
  .command("scan")
  .description(
    "Scan an MCP server. Target may be a local directory, npm:<package>, a git URL, or a GitHub owner/repo shorthand.",
  )
  .argument("<target>", "server to scan")
  .option("--json", "output machine-readable JSON instead of a report")
  .option(
    "--fail-on <grade>",
    "exit non-zero when the grade is at or below this letter (for CI)",
    "D",
  )
  .action((target: string, opts: { json?: boolean; failOn: string }) => {
    let result;
    try {
      result = scan(target);
    } catch (err) {
      console.error(`mcpguard: ${err instanceof Error ? err.message : err}`);
      process.exit(2);
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderReport(result));
    }

    const order = ["A", "B", "C", "D", "F"];
    const threshold = order.indexOf(opts.failOn.toUpperCase());
    if (threshold !== -1 && order.indexOf(result.grade) >= threshold) {
      process.exit(1);
    }
  });

program
  .command("lock")
  .description(
    "Scan one or more servers and pin their code + tool descriptions to a lockfile. Re-running updates the listed entries and leaves others untouched.",
  )
  .argument("<targets...>", "servers to lock")
  .option("--file <path>", "lockfile path", DEFAULT_LOCKFILE)
  .action((targets: string[], opts: { file: string }) => {
    const lockfile: Lockfile = readLockfile(opts.file);
    lockfile.version = LOCKFILE_VERSION;

    for (const target of targets) {
      let entry;
      try {
        const { resolvedPath, files } = loadServer(target);
        const result = analyze(target, resolvedPath, files);
        entry = buildLockEntry(result, files);
      } catch (err) {
        console.error(
          `mcpguard: cannot lock ${target}: ${err instanceof Error ? err.message : err}`,
        );
        process.exitCode = 2;
        continue;
      }
      lockfile.servers[target] = entry;
      const warn =
        entry.grade === "D" || entry.grade === "F"
          ? "  (WARNING: pinning a server that currently fails the scan)"
          : "";
      console.log(
        `locked ${target}  grade ${entry.grade}  ${entry.tools.length} tools  ${Object.keys(entry.files).length} files${warn}`,
      );
    }

    lockfile.generatedAt = new Date().toISOString();
    writeLockfile(opts.file, lockfile);
    console.log(`\nWrote ${opts.file}`);
  });

program
  .command("verify")
  .description(
    "Re-scan every server in the lockfile and report drift. Fails (exit 1) when any code or tool description changed since it was locked — the rug-pull check.",
  )
  .option("--file <path>", "lockfile path", DEFAULT_LOCKFILE)
  .option("--json", "output machine-readable JSON instead of a report")
  .action((opts: { file: string; json?: boolean }) => {
    const lockfile = readLockfile(opts.file);
    const targets = Object.keys(lockfile.servers);
    if (targets.length === 0) {
      console.error(
        `mcpguard: no servers in ${opts.file}. Run \`mcpguard lock <target>\` first.`,
      );
      process.exit(2);
    }

    const diffs: LockDiff[] = [];
    const errors: { target: string; message: string }[] = [];
    for (const target of targets) {
      const locked = lockfile.servers[target];
      try {
        const { resolvedPath, files } = loadServer(target);
        const result = analyze(target, resolvedPath, files);
        diffs.push(diffEntries(locked, buildLockEntry(result, files)));
      } catch (err) {
        errors.push({
          target,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({ diffs, errors }, null, 2));
    } else {
      console.log(renderVerifyReport(diffs, errors));
    }

    const drifted = diffs.some((d) => !d.clean);
    if (drifted || errors.length > 0) process.exit(1);
  });

program.parse();
