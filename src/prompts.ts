import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  // ── Company financial analysis prompt ────────────────────────────────────

  server.registerPrompt(
    "financial_analysis",
    {
      title: "Financial Analysis",
      description:
        "Analyze a company's financial health using SEC EDGAR data. " +
        "Retrieves key metrics and guides structured analysis.",
      argsSchema: {
        ticker: z
          .string()
          .describe("Company ticker symbol (e.g. AAPL, MSFT, GOOGL)"),
      },
    },
    async ({ ticker }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform a financial analysis of ${ticker}. Follow these steps:`,
              "",
              "1. Use search_companies to find the company's CIK number",
              "2. Use get_financial_summary to pull the latest financial snapshot",
              "3. Use get_financial_metric with 'Revenues' to see revenue trend over time",
              "4. Use get_financial_metric with 'NetIncomeLoss' to see profit trend",
              "",
              "Then provide:",
              "- Revenue growth trajectory (growing, flat, declining)",
              "- Profitability assessment (margins, net income trend)",
              "- Balance sheet health (debt-to-equity, cash position)",
              "- Key risks or red flags visible in the numbers",
              "- Overall financial health rating (Strong / Moderate / Weak)",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ── Peer comparison prompt ───────────────────────────────────────────────

  server.registerPrompt(
    "peer_comparison",
    {
      title: "Peer Comparison",
      description:
        "Compare two companies on key financial metrics side by side.",
      argsSchema: {
        ticker1: z.string().describe("First company ticker"),
        ticker2: z.string().describe("Second company ticker"),
      },
    },
    async ({ ticker1, ticker2 }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Compare ${ticker1} vs ${ticker2} on key financial metrics.`,
              "",
              "For each company:",
              "1. Use search_companies to get CIK numbers",
              "2. Use get_financial_summary for the latest snapshot",
              "3. Use get_financial_metric with 'Revenues' for revenue history",
              "",
              "Then create a comparison table covering:",
              "- Revenue (latest and 3-year trend)",
              "- Net Income",
              "- Total Assets vs Total Liabilities",
              "- Cash Position",
              "- EPS",
              "",
              "Conclude with which company appears stronger financially and why.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ── Economic overview prompt ─────────────────────────────────────────────

  server.registerPrompt(
    "economic_overview",
    {
      title: "Economic Overview",
      description:
        "Get a snapshot of current US economic conditions using FRED data.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Provide a current US economic overview. Pull the following indicators using get_economic_data:",
              "",
              "1. GDP — latest quarterly GDP",
              "2. UNRATE — current unemployment rate",
              "3. CPIAUCSL — latest CPI (inflation measure)",
              "4. FEDFUNDS — current federal funds rate",
              "5. DGS10 — 10-year treasury yield",
              "6. MORTGAGE30US — 30-year mortgage rate",
              "",
              "For each indicator, show the current value, the trend direction,",
              "and what it signals about economic conditions.",
              "",
              "Conclude with an overall economic assessment:",
              "- Is the economy expanding or contracting?",
              "- Inflationary or deflationary pressures?",
              "- Monetary policy stance (tight, neutral, loose)?",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
