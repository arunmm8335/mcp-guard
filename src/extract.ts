import type { SourceFile } from "./collect.js";
import type { ToolDescriptor } from "./types.js";

/**
 * Extract MCP tool names and descriptions from server source.
 *
 * This is intentionally pattern-based for v0. It covers the dominant styles:
 *
 * 1. TS/JS SDK: `server.tool("name", "description", ...)` and
 *    `server.registerTool("name", { description: "..." , ... })`
 * 2. Tool object literals: `{ name: "...", description: "..." }`
 *    (as returned from ListTools handlers or declared in JSON manifests)
 * 3. Python FastMCP: `@mcp.tool()` decorated functions with docstrings,
 *    and `Tool(name=..., description=...)` constructors.
 */
/**
 * Files that are never MCP tool manifests but do carry top-level
 * `name` + `description` fields — reading those as "tools" is a false positive.
 */
const NON_MANIFEST_JSON = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "jsconfig.json",
  "composer.json",
  "manifest.json",
]);

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(i + 1);
}

export function extractTools(files: SourceFile[]): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [];
  for (const file of files) {
    if (NON_MANIFEST_JSON.has(basename(file.path))) continue;
    if (/\.(js|mjs|cjs|ts|mts|cts|jsx|tsx|json)$/.test(file.path)) {
      extractFromJsLike(file, tools);
    } else if (file.path.endsWith(".py")) {
      extractFromPython(file, tools);
    }
  }
  return dedupe(tools);
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/** Matches a JS string literal including simple template literals (no nesting). */
const STR = `(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)`;

function unquote(raw: string): string {
  return raw
    .slice(1, -1)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\(["'`\\])/g, "$1");
}

function extractFromJsLike(file: SourceFile, out: ToolDescriptor[]) {
  const { content } = file;

  // Call names across the common SDKs: MCP TS SDK (`tool`, `registerTool`),
  // FastMCP / fastmcp.js and others (`addTool`).
  const CALL = `(?:tool|registerTool|addTool)`;

  // Style 1a: server.tool("name", "description", ...)
  const toolCall = new RegExp(`\\.${CALL}\\(\\s*(${STR})\\s*,\\s*(${STR})`, "g");
  for (const m of content.matchAll(toolCall)) {
    out.push({
      name: unquote(m[1]),
      description: unquote(m[2]),
      file: file.path,
      line: lineAt(content, m.index ?? 0),
    });
  }

  // Style 1b: .registerTool("name", { ... description: "..." ... })
  const registerObj = new RegExp(
    `\\.${CALL}\\(\\s*(${STR})\\s*,\\s*\\{([^]{0,2000}?)\\}`,
    "g",
  );
  for (const m of content.matchAll(registerObj)) {
    const desc = new RegExp(`description\\s*:\\s*(${STR})`).exec(m[2]);
    // Fall back to the human-readable `title` when there's no `description`
    // (some servers put the summary only in `annotations.title`).
    const title = new RegExp(`title\\s*:\\s*(${STR})`).exec(m[2]);
    const chosen = desc ?? title;
    if (chosen) {
      out.push({
        name: unquote(m[1]),
        description: unquote(chosen[1]),
        file: file.path,
        line: lineAt(content, m.index ?? 0),
      });
    }
  }

  // Style 1c: .addTool({ name: "...", description|title: "..." }) — single
  // object argument (FastMCP style), no leading name string.
  const addToolObj = new RegExp(`\\.${CALL}\\(\\s*\\{([^]{0,2000}?)\\}`, "g");
  for (const m of content.matchAll(addToolObj)) {
    const nameM = new RegExp(`name\\s*:\\s*(${STR})`).exec(m[1]);
    if (!nameM) continue;
    const desc = new RegExp(`description\\s*:\\s*(${STR})`).exec(m[1]);
    const title = new RegExp(`title\\s*:\\s*(${STR})`).exec(m[1]);
    const chosen = desc ?? title;
    out.push({
      name: unquote(nameM[1]),
      description: chosen ? unquote(chosen[1]) : "",
      file: file.path,
      line: lineAt(content, m.index ?? 0),
    });
  }

  // Style 2: { name: "...", ... description: "..." } object literals
  // (covers ListTools handler results and JSON tool manifests). The gap must
  // not cross a `}` — that would bridge a server/config `name` (e.g.
  // `new McpServer({ name, version })`) onto a later tool's description.
  const objLiteral = new RegExp(
    `name\\s*:\\s*(${STR})\\s*,([^}]{0,800}?)description\\s*:\\s*(${STR})`,
    "g",
  );
  for (const m of content.matchAll(objLiteral)) {
    out.push({
      name: unquote(m[1]),
      description: unquote(m[3]),
      file: file.path,
      line: lineAt(content, m.index ?? 0),
    });
  }

  // JSON manifests use `"name": "...", ... "description": "..."`.
  if (file.path.endsWith(".json")) {
    const jsonPair = new RegExp(
      `"name"\\s*:\\s*(${STR})\\s*,([^}]{0,800}?)"description"\\s*:\\s*(${STR})`,
      "g",
    );
    for (const m of content.matchAll(jsonPair)) {
      out.push({
        name: unquote(m[1]),
        description: unquote(m[3]),
        file: file.path,
        line: lineAt(content, m.index ?? 0),
      });
    }
  }
}

function extractFromPython(file: SourceFile, out: ToolDescriptor[]) {
  const { content } = file;

  // Style 3a: @mcp.tool() / @server.tool() decorated functions with docstrings.
  const decorated =
    /@[\w.]+\.tool\([^)]*\)\s*(?:async\s+)?def\s+(\w+)\s*\([^)]*\)[^:]*:\s*\n\s+(?:"""([^]*?)"""|'''([^]*?)''')/g;
  for (const m of content.matchAll(decorated)) {
    out.push({
      name: m[1],
      description: (m[2] ?? m[3] ?? "").trim(),
      file: file.path,
      line: lineAt(content, m.index ?? 0),
    });
  }

  // Style 3b: Tool(name="...", description="...") constructors.
  const ctor =
    /Tool\(\s*name\s*=\s*(?:"([^"]*)"|'([^']*)')\s*,[^]{0,1500}?description\s*=\s*(?:"""([^]*?)"""|'''([^]*?)'''|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  for (const m of content.matchAll(ctor)) {
    out.push({
      name: m[1] ?? m[2] ?? "",
      description: (m[3] ?? m[4] ?? m[5] ?? m[6] ?? "").trim(),
      file: file.path,
      line: lineAt(content, m.index ?? 0),
    });
  }
}

function dedupe(tools: ToolDescriptor[]): ToolDescriptor[] {
  const seen = new Set<string>();
  return tools.filter((t) => {
    const key = `${t.file}:${t.line}:${t.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
