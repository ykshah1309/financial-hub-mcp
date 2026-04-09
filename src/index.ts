#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerEdgarTools } from "./edgar/tools.js";
import { registerEdgarResources } from "./edgar/resources.js";
import { registerFredTools } from "./fred/tools.js";
import { registerPrompts } from "./prompts.js";

// ── Startup validation ────────────────────────────────────────────────────
// Fail fast on missing config rather than breaking mid-conversation.

if (!process.env.SEC_USER_AGENT_EMAIL) {
  console.error(
    "FATAL: SEC_USER_AGENT_EMAIL is not set. " +
    "SEC EDGAR requires a valid email in the User-Agent header — " +
    "requests without one risk an IP ban. Exiting."
  );
  process.exit(1);
}

if (!process.env.FRED_API_KEY) {
  console.error(
    "WARNING: FRED_API_KEY is not set. " +
    "FRED economic data tools will fail at runtime. " +
    "Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html"
  );
}

const server = new McpServer({
  name: "financial-hub-mcp",
  version: "1.2.2",
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
  console.error(`SEC EDGAR: configured (${process.env.SEC_USER_AGENT_EMAIL})`);
  console.error(
    `FRED: ${process.env.FRED_API_KEY ? "API key configured" : "NOT configured (FRED tools will fail)"}`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
