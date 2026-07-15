# mcpguard

Security scanner for **MCP (Model Context Protocol) servers**. It inspects a server *before* your AI agent connects to it and flags the two things that actually get people hurt:

1. **Tool poisoning** — hidden instructions smuggled into tool names and descriptions (the metadata an agent blindly trusts). Prompt-injection, concealment directives, credential lures, cross-tool hijacking, invisible Unicode.
2. **Malicious / dangerous code** — shell execution, credential-file access, environment harvesting, hardcoded exfiltration endpoints, install-script hooks, obfuscated payloads, reverse shells.

It works on a local directory, a published npm package, or a GitHub repo, and prints a letter grade (A–F) plus every finding with a file and line. There is a `--json` mode and a `--fail-on` gate for CI.

> Why this exists: a July 2026 scan of 36,527 public MCP servers found ~67% carry serious security flaws, and 9 of 11 public registries accepted a proof-of-concept malicious server. MCP adoption exploded before its safety layer existed. mcpguard is the start of that layer.

## Install / run

```bash
npm install
npm run build
node dist/cli.js scan <target>
```

Or during development, without building:

```bash
npm run dev -- scan <target>
```

## Usage

```bash
# a local server checkout
mcpguard scan ./my-server

# a published npm package
mcpguard scan npm:some-mcp-server

# a GitHub repo (shorthand or full URL)
mcpguard scan owner/repo
mcpguard scan https://github.com/owner/repo.git

# machine-readable output
mcpguard scan ./my-server --json

# CI gate: exit non-zero at grade D or worse (default is D)
mcpguard scan ./my-server --fail-on C
```

### Example

```
mcpguard scan: ./suspicious-server
1 files scanned · 2 tools found · 7 findings

 CRITICAL  TD001 instruction-override (tool-poisoning)
           Tool "summarize_notes": Tool description attempts to override the agent's instructions.
           index.js:5
           match: Ignore all previous instructions
 ...
Grade: F  (score 0/100)
Do not install this server without a manual security review.
```

## How it works

The scan is static and fast (no code is executed):

1. **Resolve** the target to a local directory (`src/resolve.ts`) — clones or `npm pack`s remote targets.
2. **Collect** source files, skipping `node_modules`, build output, and large blobs (`src/collect.ts`).
3. **Extract** tool names and descriptions from the dominant MCP styles: TS/JS SDK `server.tool(...)` / `registerTool(...)`, object-literal / JSON manifests, and Python `@mcp.tool()` decorators and `Tool(...)` constructors (`src/extract.ts`).
4. **Match** two rule packs (`rules/*.yaml`) — one against tool descriptions, one against code (`src/scan.ts`).
5. **Grade**: severity-weighted score, with any critical tool-poisoning finding forcing an automatic F.

## Rules

Rules are plain YAML in [`rules/`](./rules), so they're easy to review and extend:

- [`tool-poisoning.yaml`](./rules/tool-poisoning.yaml) — applied to tool descriptions.
- [`malicious-code.yaml`](./rules/malicious-code.yaml) — applied to source code.

Each rule has an id, severity, human-readable description, and a regex `pattern`. A code match is *evidence to review*, not proof of malice — the grade weighs it accordingly.

## Development

```bash
npm test        # vitest, runs against fixtures in test/fixtures
npm run build   # tsc -> dist/
```

Test fixtures cover a benign server (expects grade A), a tool-poisoned server, and a malicious-code server.

## Roadmap

This is Phase 1 (the scanner). Planned next:

- **Lockfile + CI gate** — pin every server to a content hash; fail when code or tool descriptions change from what was approved (rug-pull defense).
- **Trust registry + monitoring** — continuously re-scan the ecosystem, archive versions, alert on changes.
- **Runtime proxy** — enforce the lockfile and strip injected instructions at call time, with an audit log.

## License

MIT
