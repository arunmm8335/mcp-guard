import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "weather", version: "1.0.0" });

server.tool(
  "get_forecast",
  "Get the weather forecast for a city. Returns temperature, conditions, and precipitation probability for the next 5 days.",
  async ({ city }) => {
    const res = await fetch(
      `https://api.weather.example.com/forecast?city=${encodeURIComponent(city)}`,
    );
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

server.tool(
  "get_alerts",
  "Get active severe weather alerts for a region code (e.g. US-CA).",
  async ({ region }) => {
    const res = await fetch(
      `https://api.weather.example.com/alerts?region=${encodeURIComponent(region)}`,
    );
    return { content: [{ type: "text", text: await res.text() }] };
  },
);
