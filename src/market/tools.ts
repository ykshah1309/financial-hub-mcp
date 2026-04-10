/**
 * Finnhub Market Data MCP Tools.
 *
 * 4 tools that overlay real-time market context on top of SEC fundamental data:
 *   get_stock_quote     — live price, change, day range
 *   get_market_news     — latest headlines (general or company-specific)
 *   get_insider_transactions — recent insider buys/sells
 *   get_company_overview — merged profile + financials + peers
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getQuote,
  getCompanyProfile,
  getCompanyPeers,
  getMarketNews,
  getCompanyNews,
  getInsiderTransactions,
  getBasicFinancials,
} from "./client.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function errorResult(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function registerMarketTools(server: McpServer): void {
  // ── get_stock_quote ─────────────────────────────────────────────────────

  server.registerTool(
    "get_stock_quote",
    {
      title: "Get Stock Quote",
      description:
        "Get a real-time stock price quote. Returns current price, daily change, " +
        "percent change, day high/low, open price, and previous close. " +
        "Data is live (not cached) from Finnhub. " +
        "Requires FINNHUB_API_KEY environment variable.",
      inputSchema: {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g. AAPL, MSFT, GOOGL, AMZN)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ symbol }) => {
      try {
        const quote = await getQuote(symbol);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              symbol: symbol.toUpperCase(),
              ...quote,
              marketStatus: quote.current > 0 ? "open" : "closed/unavailable",
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_market_news ─────────────────────────────────────────────────────

  server.registerTool(
    "get_market_news",
    {
      title: "Get Market News",
      description:
        "Get latest financial news headlines. By default returns general market news. " +
        "Provide a symbol to get company-specific news instead. " +
        "Categories for general news: general, forex, crypto, merger. " +
        "Requires FINNHUB_API_KEY environment variable.",
      inputSchema: {
        symbol: z
          .string()
          .optional()
          .describe("Stock ticker for company-specific news. Omit for general market news."),
        category: z
          .enum(["general", "forex", "crypto", "merger"])
          .optional()
          .default("general")
          .describe("News category (only used when symbol is not provided)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ symbol, category }) => {
      try {
        let news;
        if (symbol) {
          const today = new Date();
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          const to = today.toISOString().split("T")[0];
          const from = weekAgo.toISOString().split("T")[0];
          news = await getCompanyNews(symbol, from, to);
        } else {
          news = await getMarketNews(category);
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              type: symbol ? "company" : "market",
              symbol: symbol?.toUpperCase(),
              category: symbol ? undefined : category,
              count: news.length,
              articles: news.map((n) => ({
                headline: n.headline,
                summary: n.summary.slice(0, 200),
                source: n.source,
                url: n.url,
                datetime: new Date(n.datetime * 1000).toISOString(),
              })),
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_insider_transactions ────────────────────────────────────────────

  server.registerTool(
    "get_insider_transactions",
    {
      title: "Get Insider Transactions",
      description:
        "Get recent insider trading activity for a company. Returns insider names, " +
        "share counts, transaction dates, prices, and buy/sell codes. " +
        "Transaction codes: P = Purchase, S = Sale, M = Option Exercise, " +
        "A = Grant/Award, G = Gift, F = Tax withholding. " +
        "Requires FINNHUB_API_KEY environment variable.",
      inputSchema: {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g. AAPL, TSLA)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ symbol }) => {
      try {
        const transactions = await getInsiderTransactions(symbol);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              symbol: symbol.toUpperCase(),
              count: transactions.length,
              transactions: transactions.map((t) => ({
                name: t.name,
                shares: t.share,
                change: t.change,
                date: t.transactionDate,
                code: t.transactionCode,
                price: t.transactionPrice,
              })),
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ── get_company_overview ────────────────────────────────────────────────

  server.registerTool(
    "get_company_overview",
    {
      title: "Get Company Overview",
      description:
        "Get a comprehensive company overview combining profile, market metrics, " +
        "and peer companies. Returns name, exchange, industry, market cap, " +
        "PE ratio, beta, 52-week range, EPS, dividend yield, and peer tickers. " +
        "This is the 'market overlay' that complements SEC fundamental data. " +
        "Requires FINNHUB_API_KEY environment variable.",
      inputSchema: {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g. AAPL, MSFT, GOOGL)"),
      },
      annotations: ANNOTATIONS,
    },
    async ({ symbol }) => {
      try {
        const [profile, metrics, peers, quote] = await Promise.all([
          getCompanyProfile(symbol),
          getBasicFinancials(symbol),
          getCompanyPeers(symbol),
          getQuote(symbol).catch(() => null),
        ]);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              symbol: symbol.toUpperCase(),
              profile: {
                name: profile.name,
                exchange: profile.exchange,
                industry: profile.finnhubIndustry,
                country: profile.country,
                currency: profile.currency,
                ipo: profile.ipo,
                weburl: profile.weburl,
                logo: profile.logo,
              },
              marketData: {
                marketCap: profile.marketCapitalization,
                sharesOutstanding: profile.shareOutstanding,
                currentPrice: quote?.current ?? null,
                change: quote?.change ?? null,
                percentChange: quote?.percentChange ?? null,
              },
              financialMetrics: {
                peRatio: metrics["peBasicExclExtraTTM"] ?? metrics["peTTM"] ?? null,
                pegRatio: metrics["pegRatio"] ?? null,
                beta: metrics["beta"] ?? null,
                epsAnnual: metrics["epsBasicExclExtraItemsAnnual"] ?? null,
                epsTTM: metrics["epsBasicExclExtraItemsTTM"] ?? null,
                dividendYield: metrics["dividendYieldIndicatedAnnual"] ?? null,
                "52WeekHigh": metrics["52WeekHigh"] ?? null,
                "52WeekLow": metrics["52WeekLow"] ?? null,
                "52WeekPriceReturnDaily": metrics["52WeekPriceReturnDaily"] ?? null,
                revenuePerShareTTM: metrics["revenuePerShareTTM"] ?? null,
                bookValuePerShareQuarterly: metrics["bookValuePerShareQuarterly"] ?? null,
                "10DayAvgVolume": metrics["10DayAverageTradingVolume"] ?? null,
                "3MonthAvgVolume": metrics["3MonthAverageTradingVolume"] ?? null,
              },
              peers: peers.slice(0, 10),
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
