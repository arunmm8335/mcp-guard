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
export function extractTools(files: SourceFile[]): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [];
  for (const file of files) {
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

  // Style 1a: server.tool("name", "description", ...)
  const toolCall = new RegExp(
    `\\.(?:tool|registerTool)\\(\\s*(${STR})\\s*,\\s*(${STR})`,
    "g",
  );
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
    `\\.(?:tool|registerTool)\\(\\s*(${STR})\\s*,\\s*\\{([^]{0,2000}?)\\}`,
    "g",
  );
  for (const m of content.matchAll(registerObj)) {
    const desc = new RegExp(`description\\s*:\\s*(${STR})`).exec(m[2]);
    if (desc) {
      out.push({
        name: unquote(m[1]),
        description: unquote(desc[1]),
        file: file.path,
        line: lineAt(content, m.index ?? 0),
      });
    }
  }

  // Style 2: { name: "...", ... description: "..." } object literals
  // (covers ListTools handler results and JSON tool manifests).
  const objLiteral = new RegExp(
    `name\\s*:\\s*(${STR})\\s*,([^]{0,1500}?)description\\s*:\\s*(${STR})`,
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
      `"name"\\s*:\\s*(${STR})\\s*,([^]{0,1500}?)"description"\\s*:\\s*(${STR})`,
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
