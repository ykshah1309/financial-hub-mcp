#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerEdgarTools } from "./edgar/tools.js";
import { registerEdgarResources } from "./edgar/resources.js";
import { registerFredTools } from "./fred/tools.js";
import { registerPrompts } from "./prompts.js";

const server = new McpServer({
  name: "financial-hub-mcp",
  version: "1.0.0",
});

// Register all tools, resources, and prompts
registerEdgarTools(server);
registerEdgarResources(server);
registerFredTools(server);
registerPrompts(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Financial Hub MCP Server running on stdio");
  console.error("SEC EDGAR tools: no API key required");
  console.error(
    `FRED tools: ${process.env.FRED_API_KEY ? "API key configured" : "set FRED_API_KEY for economic data"}`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
