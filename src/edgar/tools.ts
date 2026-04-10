import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchCompanies,
  getCompanyFilings,
  getCompanyConcept,
  getCompanyFacts,
  searchFilings,
} from "./client.js";
import { deduplicateFacts, annualOnly, computeGrowth, detectTrend, summarizeFacts } from "./xbrl.js";
import { resolveConcept, findConceptData, listAvailableConcepts } from "./concepts.js";
import { analyzeCompany, compareCompanies } from "./analytics.js";
import { extractCorporateEvents } from "./events.js";
import { screenCompanies, listIndustries, SIC_INDUSTRIES } from "./screening.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Format numbers for readable output: 1234567890 → "1.23B" */
function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

/** Minified JSON — no whitespace, saves ~30% tokens over pretty-print. */
function compactJson(obj: unknown): string {
  return JSON.stringify(obj);
}

/** MCP-compliant error response with isError flag. */
function errorResult(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

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
      annotations: ANNOTATIONS,
    },
    async ({ query }) => {
      try {
        const results = await searchCompanies(query);
        return { content: [{ type: "text" as const, text: compactJson(results) }] };
      } catch (err) {
        return errorResult(err);
      }
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
      annotations: ANNOTATIONS,
    },
    async ({ cik, formType }) => {
      try {
        const submission = await getCompanyFilings(cik, formType);
        return { content: [{ type: "text" as const, text: compactJson(submission) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_financial_metric ─────────────────────────────────────────────────

  server.registerTool(
    "get_financial_metric",
    {
      title: "Get Financial Metric",
      description:
        "Get deduplicated historical values of a financial metric for a company. " +
        "Automatically resolves concept aliases — you can use friendly names like " +
        "'revenue', 'net_income', 'eps', 'cash', 'total_assets' or raw XBRL tags. " +
        "Returns clean, one-per-period values with trend analysis. " +
        "Available concepts: revenue, net_income, gross_profit, operating_income, " +
        "eps, total_assets, total_liabilities, stockholders_equity, cash, " +
        "long_term_debt, operating_cash_flow, capex, shares_outstanding.",
      inputSchema: {
        cik: z.string().describe("Company CIK number"),
        concept: z
          .string()
          .describe(
            "Financial concept — use friendly names (revenue, net_income, eps, cash, total_assets) " +
            "or raw XBRL tags (Revenues, NetIncomeLoss)"
          ),
        taxonomy: z
          .string()
          .optional()
          .default("us-gaap")
          .describe("XBRL taxonomy — almost always us-gaap"),
        annualOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, return only annual (FY) data points — cleaner for trend analysis"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ cik, concept, taxonomy, annualOnly: onlyAnnual }) => {
      try {
        const resolved = resolveConcept(concept);

        let tag = resolved.tags[0];
        let rawFacts: any[] | null = null;
        let unitKey = "USD";

        try {
          const facts = await getCompanyFacts(cik);
          const gaap = facts[taxonomy] ?? {};
          const found = findConceptData(gaap, concept);
          if (found) {
            tag = found.tag;
            rawFacts = found.facts;
            unitKey = found.unit;
          }
        } catch {
          // Fall back to direct concept API
        }

        if (!rawFacts) {
          try {
            const data = await getCompanyConcept(cik, tag, taxonomy);
            rawFacts = data.units["USD"] ?? data.units["USD/shares"] ?? Object.values(data.units)[0] ?? [];
            unitKey = data.units["USD"] ? "USD" : Object.keys(data.units)[0] ?? "USD";
          } catch {
            return {
              content: [{
                type: "text" as const,
                text: `No data found for concept "${concept}" (tried tags: ${resolved.tags.join(", ")}). ` +
                  `This company may use a different XBRL tag for this metric.`,
              }],
              isError: true,
            };
          }
        }

        let clean = deduplicateFacts(rawFacts);
        if (onlyAnnual) clean = annualOnly(clean);

        const capped = clean.slice(-20);
        const totalAvailable = clean.length;

        const annuals = annualOnly(clean);
        const growth = computeGrowth(annuals);
        const trend = detectTrend(growth);

        const summary = {
          cik,
          metric: tag,
          resolvedFrom: concept !== tag ? concept : undefined,
          label: resolved.label,
          unit: unitKey,
          trend,
          periodsShown: capped.length,
          totalPeriodsAvailable: totalAvailable,
          values: capped.map((f) => ({
            periodEnd: f.periodEnd,
            value: f.value,
            formatted: formatNumber(f.value),
            fiscalYear: f.fiscalYear,
            fiscalPeriod: f.fiscalPeriod,
            form: f.form,
          })),
          annualGrowth: growth.slice(-5).map((g) => ({
            fiscalYear: g.fiscalYear,
            value: formatNumber(g.value),
            yoyGrowth: g.growthRate !== null ? (g.growthRate * 100).toFixed(1) + "%" : null,
          })),
        };

        return { content: [{ type: "text" as const, text: compactJson(summary) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_financial_summary ────────────────────────────────────────────────

  server.registerTool(
    "get_financial_summary",
    {
      title: "Get Financial Summary",
      description:
        "Get a comprehensive financial snapshot with computed ratios. " +
        "Returns latest revenue, net income, assets, liabilities, equity, cash, " +
        "debt, EPS — plus profit margin, debt-to-equity, current ratio, and ROE. " +
        "All values are deduplicated and from the most recent annual filing.",
      inputSchema: {
        cik: z.string().describe("Company CIK number"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ cik }) => {
      try {
        const facts = await getCompanyFacts(cik);
        const gaap = facts["us-gaap"] ?? {};

        function latestAnnual(conceptInput: string): { value: number; period: string; formatted: string } | null {
          const found = findConceptData(gaap, conceptInput);
          if (!found) return null;

          const deduped = deduplicateFacts(found.facts);
          const annuals = annualOnly(deduped);
          const last = annuals[annuals.length - 1] ?? deduped[deduped.length - 1];
          if (!last) return null;

          return { value: last.value, period: last.periodEnd, formatted: formatNumber(last.value) };
        }

        const revenue = latestAnnual("revenue");
        const netIncome = latestAnnual("net_income");
        const totalAssets = latestAnnual("total_assets");
        const totalLiabilities = latestAnnual("total_liabilities");
        const equity = latestAnnual("stockholders_equity");
        const cash = latestAnnual("cash");
        const debt = latestAnnual("long_term_debt");
        const eps = latestAnnual("eps");
        const currentAssets = latestAnnual("current_assets");
        const currentLiabilities = latestAnnual("current_liabilities");
        const operatingCashFlow = latestAnnual("operating_cash_flow");
        const capex = latestAnnual("capex");

        const profitMargin = revenue && netIncome
          ? ((netIncome.value / revenue.value) * 100).toFixed(1) + "%"
          : null;
        const debtToEquity = equity && debt && equity.value !== 0
          ? (debt.value / equity.value).toFixed(2)
          : null;
        const currentRatio = currentAssets && currentLiabilities && currentLiabilities.value !== 0
          ? (currentAssets.value / currentLiabilities.value).toFixed(2)
          : null;
        const roe = equity && netIncome && equity.value !== 0
          ? ((netIncome.value / equity.value) * 100).toFixed(1) + "%"
          : null;
        const roa = totalAssets && netIncome && totalAssets.value !== 0
          ? ((netIncome.value / totalAssets.value) * 100).toFixed(1) + "%"
          : null;
        const freeCashFlow = operatingCashFlow && capex
          ? { value: operatingCashFlow.value - capex.value, formatted: formatNumber(operatingCashFlow.value - capex.value) }
          : null;

        const summary = {
          metrics: {
            revenue, netIncome, totalAssets, totalLiabilities,
            stockholdersEquity: equity, cash, longTermDebt: debt, eps,
            currentAssets, currentLiabilities, operatingCashFlow, freeCashFlow,
          },
          ratios: { profitMargin, debtToEquity, currentRatio, returnOnEquity: roe, returnOnAssets: roa },
        };

        return { content: [{ type: "text" as const, text: compactJson(summary) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_company_facts_summary ───────────────────────────────────────────

  server.registerTool(
    "get_company_facts_summary",
    {
      title: "Get Company Facts Summary",
      description:
        "Get a compact index of all available XBRL financial data for a company. " +
        "Returns concept names, latest values, and data point counts — NOT the full time series. " +
        "Use this to discover what data is available, then use get_financial_metric for details.",
      inputSchema: {
        cik: z.string().describe("Company CIK number"),
        limit: z
          .number()
          .optional()
          .default(40)
          .describe("Max concepts to return (default 40, max 100)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ cik, limit }) => {
      try {
        const facts = await getCompanyFacts(cik);
        const gaap = facts["us-gaap"] ?? {};
        const cap = Math.min(limit ?? 40, 100);
        const summary = summarizeFacts(gaap, cap);

        return {
          content: [{
            type: "text" as const,
            text: compactJson({
              cik,
              taxonomies: Object.keys(facts),
              totalConcepts: Object.keys(gaap).length,
              topConcepts: summary,
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── analyze_financials ────────────────────────────────────────────────────

  server.registerTool(
    "analyze_financials",
    {
      title: "Analyze Company Financials",
      description:
        "Deep financial analysis with computed ratios, growth metrics, and health scoring. " +
        "Returns profit margins, ROE, ROA, debt-to-equity, current ratio, revenue/income/EPS growth " +
        "with CAGR, trend detection, and a composite health grade (A-F). " +
        "This goes beyond raw data — it interprets the numbers.",
      inputSchema: {
        cik: z.string().describe("Company CIK number"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ cik }) => {
      try {
        const analysis = await analyzeCompany(cik);
        return { content: [{ type: "text" as const, text: compactJson(analysis) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── compare_companies ───────────────────────────────────────────────────

  server.registerTool(
    "compare_companies",
    {
      title: "Compare Companies",
      description:
        "Side-by-side financial comparison of 2-5 companies with normalized metrics. " +
        "Compares revenue, income, assets, cash, ratios, and health scores. " +
        "Identifies the winner in each category. All data is deduplicated and from annual filings.",
      inputSchema: {
        ciks: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe("Array of 2-5 company CIK numbers to compare"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ ciks }) => {
      try {
        const comparison = await compareCompanies(ciks);
        return { content: [{ type: "text" as const, text: compactJson(comparison) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── search_filings ───────────────────────────────────────────────────────

  server.registerTool(
    "search_filings",
    {
      title: "Search SEC Filings",
      description:
        "Full-text search across all SEC EDGAR filings. " +
        "Search for keywords in filing documents, optionally filtered by form type and date range. " +
        "Supports pagination — use offset to fetch subsequent pages.",
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
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Results per page (default 20, max 50)"),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Number of results to skip for pagination"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ query, forms, startDate, endDate, limit, offset }) => {
      try {
        const response = await searchFilings(query, forms, startDate, endDate, limit, offset);
        return { content: [{ type: "text" as const, text: compactJson(response) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── screen_stocks ─────────────────────────────────────────────────────────

  const industryKeys = Object.keys(SIC_INDUSTRIES).join(", ");

  server.registerTool(
    "screen_stocks",
    {
      title: "Screen Stocks",
      description:
        "Discover SEC-registered companies by exchange, industry, name, or " +
        "financial health score. Fast filters (exchange, name) search 10,000+ " +
        "companies instantly. Deep filters (industry, health score) require " +
        "per-company API calls and are slower. " +
        `Available industries: ${industryKeys}.`,
      inputSchema: {
        exchange: z
          .string()
          .optional()
          .describe("Stock exchange filter (NYSE, NASDAQ, AMEX, etc.)"),
        industry: z
          .string()
          .optional()
          .describe(`SIC industry group: ${industryKeys}`),
        nameContains: z
          .string()
          .optional()
          .describe("Substring match on company name or ticker"),
        minHealthScore: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Minimum financial health score (0-100). Requires API calls per company — slower."),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Max results (default 20, max 50)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ exchange, industry, nameContains, minHealthScore, limit }) => {
      try {
        const results = await screenCompanies({ exchange, industry, nameContains, minHealthScore, limit });
        return {
          content: [{
            type: "text" as const,
            text: compactJson({
              count: results.length,
              filters: { exchange, industry, nameContains, minHealthScore },
              availableIndustries: industry ? undefined : listIndustries(),
              results,
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_corporate_events ──────────────────────────────────────────────────

  server.registerTool(
    "get_corporate_events",
    {
      title: "Get Corporate Events",
      description:
        "Get recent 8-K corporate events for a company, classified by event type " +
        "and significance. Covers M&A, earnings announcements, leadership changes, " +
        "material agreements, cybersecurity incidents, delisting notices, auditor " +
        "changes, shareholder votes, and more. Each event includes the SEC item " +
        "number, human-readable label, category, and significance level (high/medium/low).",
      inputSchema: {
        cik: z
          .string()
          .describe("Company CIK number (from search_companies)"),
        significance: z
          .enum(["high", "medium", "low"])
          .optional()
          .describe(
            "Filter by minimum significance level. " +
            "'high' = M&A, earnings, leadership, bankruptcies. " +
            "'medium' = governance, obligations, equity sales. " +
            "'low' = all events including exhibits."
          ),
        limit: z
          .number()
          .optional()
          .default(15)
          .describe("Max events to return (default 15, max 50)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ cik, significance, limit }) => {
      try {
        const events = await extractCorporateEvents(cik, { significance, limit });
        return { content: [{ type: "text" as const, text: compactJson(events) }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
