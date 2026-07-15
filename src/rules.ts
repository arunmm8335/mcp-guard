import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { Rule } from "./types.js";

export interface CompiledRule extends Rule {
  regex: RegExp;
}

/** Load and compile all rule packs from the package's `rules/` directory. */
export function loadRules(rulesDir?: string): CompiledRule[] {
  const dir =
    rulesDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "rules");
  const rules: CompiledRule[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const doc = parse(readFileSync(join(dir, file), "utf8")) as {
      rules: Rule[];
    };
    for (const rule of doc.rules ?? []) {
      rules.push({
        ...rule,
        regex: new RegExp(rule.pattern, rule.caseSensitive ? "" : "i"),
      });
    }
  }
  const ids = rules.map((r) => r.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    throw new Error(`Duplicate rule ids: ${[...new Set(dupes)].join(", ")}`);
  }
  return rules;
}
