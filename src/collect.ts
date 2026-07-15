import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface SourceFile {
  /** Path relative to the scan root. */
  path: string;
  content: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  ".next",
]);

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
  ".md",
]);

const MAX_FILE_BYTES = 1024 * 1024; // skip files >1MB (bundles, data blobs)

export function collectSourceFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
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
        if (!SKIP_DIRS.has(entry)) walk(full);
        continue;
      }
      const ext = entry.slice(entry.lastIndexOf("."));
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
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
