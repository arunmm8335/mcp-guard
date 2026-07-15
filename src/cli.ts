#!/usr/bin/env node
import { Command } from "commander";
import { renderReport } from "./report.js";
import { scan } from "./scan.js";

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

program.parse();
