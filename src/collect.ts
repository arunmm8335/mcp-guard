import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface SourceFile {
  /** Path relative to the scan root. */
  path: string;
  content: string;
}

/** Always skipped: caches, vendored deps, VCS metadata — never the code to review. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  ".next",
]);

/**
 * Build-output dirs. These are skipped ONLY when the target also ships a
 * `src/` tree (so `dist/` is generated duplicate of reviewed source). A
 * published npm package ships its executable code in `dist/` with no `src/`,
 * and that compiled code is exactly what the agent runs — so it must be
 * scanned. This is what a malicious npm MCP server hides behind.
 */
const GENERATED_DIRS = new Set(["dist", "build", "out"]);

/** Jest/vitest convention dirs — not part of the server's runtime tool surface. */
const TEST_DIRS = new Set(["__tests__", "__mocks__", "__snapshots__"]);

/** Test/spec files don't execute when an agent uses the server. */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|[._-])test_.*\.py$|_test\.py$/i;

function isTestFile(name: string): boolean {
  return TEST_FILE.test(name);
}

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".jsx",
  ".tsx",
  ".py",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
]);

const MAX_FILE_BYTES = 1024 * 1024; // skip files >1MB (bundles, data blobs)

export function collectSourceFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  // Only treat dist/build/out as throwaway when real source sits beside them.
  const hasSource = existsSync(join(root, "src"));
  walk(root);
  return files;

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        if (TEST_DIRS.has(entry)) continue;
        if (GENERATED_DIRS.has(entry) && hasSource) continue;
        walk(full);
        continue;
      }
      const ext = entry.slice(entry.lastIndexOf("."));
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (isTestFile(entry)) continue;
      if (st.size > MAX_FILE_BYTES) continue;
      try {
        files.push({
          path: relative(root, full),
          content: readFileSync(full, "utf8"),
        });
      } catch {
        // unreadable or non-UTF8 file — skip
      }
    }
  }
}
