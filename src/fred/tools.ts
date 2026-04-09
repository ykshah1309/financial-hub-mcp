import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSeries, getObservations } from "./client.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** MCP-compliant error response with isError flag. */
function errorResult(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function registerFredTools(server: McpServer): void {
  // ── search_economic_data ─────────────────────────────────────────────────

  server.registerTool(
    "search_economic_data",
    {
      title: "Search Economic Data",
      description:
        "Search the FRED database for economic data series. " +
        "FRED contains over 800,000 time series from 100+ sources — " +
        "GDP, inflation, unemployment, interest rates, housing, and more. " +
        "Returns series IDs that can be used with get_economic_data.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search terms (e.g. 'GDP', 'unemployment rate', 'consumer price index')"
          ),
      },
      annotations: ANNOTATIONS,
    },
    async ({ query }) => {
      try {
        const results = await searchSeries(query);
        return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_economic_data ────────────────────────────────────────────────────

  server.registerTool(
    "get_economic_data",
    {
      title: "Get Economic Data",
      description:
        "Get time series observations for a FRED economic data series. " +
        "Returns recent data points with dates and values. " +
        "Common series: GDP (Gross Domestic Product), CPIAUCSL (CPI), " +
        "UNRATE (Unemployment Rate), FEDFUNDS (Fed Funds Rate), " +
        "DGS10 (10-Year Treasury), SP500 (S&P 500), " +
        "MORTGAGE30US (30-Year Mortgage Rate).",
      inputSchema: {
        seriesId: z
          .string()
          .describe("FRED series ID (e.g. GDP, UNRATE, CPIAUCSL)"),
        startDate: z
          .string()
          .optional()
          .describe("Start date in YYYY-MM-DD format"),
        endDate: z
          .string()
          .optional()
          .describe("End date in YYYY-MM-DD format"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ seriesId, startDate, endDate }) => {
      try {
        const data = await getObservations(seriesId, startDate, endDate);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
