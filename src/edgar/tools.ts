import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchCompanies,
  getCompanyFilings,
  getCompanyConcept,
  getCompanyFacts,
  searchFilings,
} from "./client.js";

export function registerEdgarTools(server: McpServer): void {
  // ── search_companies ─────────────────────────────────────────────────────

  server.registerTool(
    "search_companies",
    {
      title: "Search Companies",
      description:
        "Search for SEC-registered companies by name or ticker symbol. " +
        "Returns matching company names, tickers, and CIK numbers. " +
        "Use the CIK for subsequent filing and financial data lookups.",
      inputSchema: {
        query: z
          .string()
          .describe("Company name or ticker symbol to search for"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query }) => {
      const results = await searchCompanies(query);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    }
  );

  // ── get_company_filings ──────────────────────────────────────────────────

  server.registerTool(
    "get_company_filings",
    {
      title: "Get Company Filings",
      description:
        "Get recent SEC filings for a company by CIK number. " +
        "Returns filing metadata including form type, filing date, and document links. " +
        "Optionally filter by form type (e.g. 10-K, 10-Q, 8-K, DEF 14A).",
      inputSchema: {
        cik: z
          .string()
          .describe("Central Index Key — the SEC's unique company identifier"),
        formType: z
          .string()
          .optional()
          .describe(
            "Filter by SEC form type (e.g. 10-K, 10-Q, 8-K). Omit to return all types."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ cik, formType }) => {
      const submission = await getCompanyFilings(cik, formType);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(submission, null, 2),
          },
        ],
      };
    }
  );

  // ── get_financial_metric ─────────────────────────────────────────────────

  server.registerTool(
    "get_financial_metric",
    {
      title: "Get Financial Metric",
      description:
        "Get historical values of a specific XBRL financial metric for a company. " +
        "Returns all reported values across filings with amounts, periods, and fiscal years. " +
        "Common concepts: Revenues, NetIncomeLoss, Assets, Liabilities, " +
        "StockholdersEquity, EarningsPerShareBasic, OperatingIncomeLoss, " +
        "CashAndCashEquivalentsAtCarryingValue, LongTermDebt.",
      inputSchema: {
        cik: z.string().describe("Company CIK number"),
        concept: z
          .string()
          .describe(
            "XBRL concept tag (e.g. Revenues, NetIncomeLoss, Assets)"
          ),
        taxonomy: z
          .string()
          .optional()
          .default("us-gaap")
          .describe("XBRL taxonomy — almost always us-gaap"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ cik, concept, taxonomy }) => {
      const data = await getCompanyConcept(cik, concept, taxonomy);
      // Flatten to the most useful unit (typically USD)
      const usdFacts = data.units["USD"] ?? Object.values(data.units)[0] ?? [];
      const recent = usdFacts.slice(-20);
      const summary = {
        company_cik: data.cik,
        metric: data.tag,
        label: data.label,
        description: data.description,
        values: recent.map((f) => ({
          period_end: f.end,
          value: f.val,
          fiscal_year: f.fy,
          fiscal_period: f.fp,
          form: f.form,
          filed: f.filed,
        })),
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
        ],
      };
    }
  );

  // ── get_financial_summary ────────────────────────────────────────────────

  server.registerTool(
    "get_financial_summary",
    {
      title: "Get Financial Summary",
      description:
        "Get a comprehensive financial snapshot for a company — latest revenue, " +
        "net income, total assets, total liabilities, and stockholders equity " +
        "pulled from XBRL filings. Useful for quick company analysis.",
      inputSchema: {
        cik: z.string().describe("Company CIK number"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ cik }) => {
      const facts = await getCompanyFacts(cik);
      const gaap = facts["us-gaap"] ?? {};

      function latest(tag: string): { value: number; period: string } | null {
        const concept = gaap[tag] as any;
        if (!concept?.units) return null;
        const usd =
          concept.units["USD"] ?? Object.values(concept.units)[0] ?? [];
        if (usd.length === 0) return null;
        // Get most recent 10-K or 10-Q filing
        const annual = usd.filter(
          (f: any) => f.form === "10-K" || f.form === "10-Q"
        );
        const last = annual[annual.length - 1] ?? usd[usd.length - 1];
        return { value: last.val, period: last.end };
      }

      const summary = {
        revenue: latest("Revenues") ?? latest("RevenueFromContractWithCustomerExcludingAssessedTax"),
        netIncome: latest("NetIncomeLoss"),
        totalAssets: latest("Assets"),
        totalLiabilities: latest("Liabilities"),
        stockholdersEquity: latest("StockholdersEquity"),
        cash: latest("CashAndCashEquivalentsAtCarryingValue"),
        longTermDebt: latest("LongTermDebt") ?? latest("LongTermDebtNoncurrent"),
        eps: latest("EarningsPerShareBasic"),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
        ],
      };
    }
  );

  // ── search_filings ───────────────────────────────────────────────────────

  server.registerTool(
    "search_filings",
    {
      title: "Search SEC Filings",
      description:
        "Full-text search across all SEC EDGAR filings. " +
        "Search for keywords in filing documents, optionally filtered by form type and date range.",
      inputSchema: {
        query: z.string().describe("Search terms to find in filings"),
        forms: z
          .string()
          .optional()
          .describe("Comma-separated form types to filter (e.g. '10-K,10-Q')"),
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
    async ({ query, forms, startDate, endDate }) => {
      const results = await searchFilings(query, forms, startDate, endDate);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    }
  );
}
