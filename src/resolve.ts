import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface ResolvedTarget {
  /** Local directory containing the server source to scan. */
  path: string;
  /** How the target was interpreted. */
  kind: "local" | "npm" | "git";
}

/**
 * Resolve a scan target to a local directory.
 *
 * Supported forms:
 * - a local directory path
 * - `npm:<package>` — downloads the published tarball via `npm pack`
 * - a git URL (or `owner/repo` GitHub shorthand) — shallow clone
 */
export function resolveTarget(target: string): ResolvedTarget {
  if (target.startsWith("npm:")) {
    return { path: fetchNpmPackage(target.slice(4)), kind: "npm" };
  }
  if (/^(https?:\/\/|git@)/.test(target)) {
    return { path: cloneRepo(target), kind: "git" };
  }
  const local = resolve(target);
  if (existsSync(local) && statSync(local).isDirectory()) {
    return { path: local, kind: "local" };
  }
  // GitHub shorthand like `owner/repo` (only when it isn't a real dir).
  if (/^[\w.-]+\/[\w.-]+$/.test(target)) {
    return { path: cloneRepo(`https://github.com/${target}.git`), kind: "git" };
  }
  throw new Error(
    `Cannot resolve target "${target}". Use a local directory, npm:<package>, a git URL, or owner/repo.`,
  );
}

function fetchNpmPackage(pkg: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mcpguard-npm-"));
  execFileSync("npm", ["pack", pkg, "--pack-destination", dir], {
    stdio: "pipe",
  });
  const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error(`npm pack produced no tarball for ${pkg}`);
  execFileSync("tar", ["-xzf", join(dir, tarball), "-C", dir], { stdio: "pipe" });
  // npm tarballs unpack into a `package/` directory.
  const unpacked = join(dir, "package");
  return existsSync(unpacked) ? unpacked : dir;
}

function cloneRepo(url: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mcpguard-git-"));
  execFileSync("git", ["clone", "--depth", "1", url, dir], { stdio: "pipe" });
  return dir;
}
