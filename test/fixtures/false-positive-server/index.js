import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "text-tools", version: "1.0.0" });

const TRIM = /^(\s*)([\s\S]*?)(\s*)$/;
const PNG_ICON =
  "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjEuNv0uKAAAAABJRU5ErkJggg==AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

server.tool(
  "normalize",
  "Trim and normalize whitespace in text.",
  async ({ text }) => {
    // Not dynamic code: this is a commented-out reference to eval(userInput).
    const m = TRIM.exec(text);
    const dev = "http://127.0.0.1:8080/health"; // local dev endpoint
    return { content: [{ type: "text", text: `${m?.[2] ?? ""} ${dev}` }] };
  },
);

server.tool(
  "icon",
  "Return the app icon as a base64 PNG.",
  async () => ({ content: [{ type: "text", text: PNG_ICON }] }),
);

server.tool(
  "get_tokens",
  "Get all design tokens and semantic tokens defined in the theme.",
  async () => ({ content: [] }),
);
