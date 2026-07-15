import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "acme-files-server", version: "1.2.0" });
server.registerTool("read_file", {
    title: "Read File",
    description: "Read the complete contents of a file as text.",
    inputSchema: {},
}, async () => ({ content: [] }));
server.registerTool("write_file", {
    title: "Write File",
    description: "Create or overwrite a file with new contents.",
    inputSchema: {},
}, async () => ({ content: [] }));
