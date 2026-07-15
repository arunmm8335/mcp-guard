import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules.js";
import { scan } from "../src/scan.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const rulesDir = join(here, "..", "rules");

function scanFixture(name: string) {
  return scan(join(fixtures, name), rulesDir);
}

describe("rule packs", () => {
  it("compile without duplicate ids", () => {
    const rules = loadRules(rulesDir);
    expect(rules.length).toBeGreaterThan(20);
  });
});

describe("benign server", () => {
  it("gets an A with no findings", () => {
    const result = scanFixture("benign-server");
    expect(result.findings).toHaveLength(0);
    expect(result.grade).toBe("A");
    expect(result.tools.length).toBe(2);
  });
});

describe("tool-poisoned server", () => {
  const result = scanFixture("poisoned-server");

  it("is graded F", () => {
    expect(result.grade).toBe("F");
  });

  it("detects the instruction-override injection", () => {
    expect(result.findings.map((f) => f.ruleId)).toContain("TD001");
  });

  it("detects the concealment directive", () => {
    expect(result.findings.map((f) => f.ruleId)).toContain("TD002");
  });

  it("detects the cross-tool hijack", () => {
    expect(result.findings.map((f) => f.ruleId)).toContain("TD006");
  });

  it("reports a file and line for every finding", () => {
    for (const f of result.findings) {
      expect(f.file).toBeTruthy();
      expect(f.line).toBeGreaterThan(0);
    }
  });
});

describe("benign patterns that must not false-positive", () => {
  const result = scanFixture("false-positive-server");

  it("does not flag regex .exec() as dynamic code eval", () => {
    expect(result.findings.map((f) => f.ruleId)).not.toContain("MC002");
  });

  it("does not flag a loopback (127.0.0.1) dev endpoint", () => {
    expect(result.findings.map((f) => f.ruleId)).not.toContain("MC012");
  });

  it("does not flag an embedded base64 PNG as a hidden blob", () => {
    expect(result.findings.map((f) => f.ruleId)).not.toContain("MC007");
  });

  it("is graded A", () => {
    expect(result.grade).toBe("A");
    expect(result.findings).toHaveLength(0);
  });
});

describe("npm-style server (dist-only, no src)", () => {
  const result = scanFixture("npm-style-server");

  it("scans the compiled dist code when there is no src tree", () => {
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it("extracts only real tools, not the server name or package name", () => {
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["read_file", "write_file"]);
  });

  it("is graded A", () => {
    expect(result.grade).toBe("A");
  });
});

describe("malicious-code server", () => {
  const result = scanFixture("malicious-code-server");

  it("is graded F", () => {
    expect(result.grade).toBe("F");
  });

  it("flags the exfiltration endpoint", () => {
    expect(result.findings.map((f) => f.ruleId)).toContain("MC005");
  });

  it("flags shell execution", () => {
    expect(result.findings.map((f) => f.ruleId)).toContain("MC001");
  });

  it("flags the install-script hook", () => {
    expect(result.findings.map((f) => f.ruleId)).toContain("MC008");
  });
});
