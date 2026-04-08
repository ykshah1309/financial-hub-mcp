import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSeries, getObservations } from "./client.js";

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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query }) => {
      const results = await searchSeries(query);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ seriesId, startDate, endDate }) => {
      const data = await getObservations(seriesId, startDate, endDate);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data, null, 2) },
        ],
      };
    }
  );
}
