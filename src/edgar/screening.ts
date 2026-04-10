/**
 * Stock Screening — discover companies by exchange, industry, and financial health.
 *
 * Two-phase approach:
 *  1. Fast filter (client-side): exchange, name pattern on company_tickers_exchange.json
 *  2. Deep filter (API calls): SIC industry from submissions, health score from analytics
 *
 * Fast filters cover 10,000+ SEC-registered companies instantly.
 * Deep filters require per-company API calls and are capped at the limit parameter.
 */

import { getCompanyFilings } from "./client.js";
import { analyzeCompany } from "./analytics.js";
import { edgarLimiter, fetchWithRetry } from "../rate-limiter.js";
import { TTLCache } from "../cache.js";

// ── SIC Industry Classification ─────────────────────────────────────────────

interface SicGroup {
  range: [number, number];
  label: string;
}

export const SIC_INDUSTRIES: Record<string, SicGroup> = {
  agriculture:    { range: [100, 999],   label: "Agriculture, Forestry, Fishing" },
  mining:         { range: [1000, 1499], label: "Mining" },
  construction:   { range: [1500, 1799], label: "Construction" },
  manufacturing:  { range: [2000, 3999], label: "Manufacturing" },
  transportation: { range: [4000, 4999], label: "Transportation & Utilities" },
  wholesale:      { range: [5000, 5199], label: "Wholesale Trade" },
  retail:         { range: [5200, 5999], label: "Retail Trade" },
  finance:        { range: [6000, 6799], label: "Finance, Insurance, Real Estate" },
  services:       { range: [7000, 8999], label: "Services" },
  public_admin:   { range: [9100, 9729], label: "Public Administration" },
};

function matchesSicGroup(sic: string, industry: string): boolean {
  const group = SIC_INDUSTRIES[industry.toLowerCase()];
  if (!group) return false;
  const code = parseInt(sic, 10);
  if (isNaN(code)) return false;
  return code >= group.range[0] && code <= group.range[1];
}

// ── Ticker Exchange Data ────────────────────────────────────────────────────

interface TickerExchange {
  cik: string;
  name: string;
  ticker: string;
  exchange: string;
}

const tickerExchangeCache = new TTLCache<TickerExchange[]>(86400, 1);

async function loadTickerExchange(): Promise<TickerExchange[]> {
  const cached = tickerExchangeCache.get("all");
  if (cached) return cached;

  const url = "https://www.sec.gov/files/company_tickers_exchange.json";
  const headers = {
    "User-Agent": `financial-hub-mcp/1.0 ${process.env.SEC_USER_AGENT_EMAIL ?? ""}`,
    Accept: "application/json",
  };

  const res = await fetchWithRetry(url, { headers }, edgarLimiter);
  if (!res.ok) throw new Error(`Failed to fetch ticker exchange data: ${res.status}`);

  const data = (await res.json()) as {
    fields: string[];
    data: Array<[number, string, string, string]>;
  };

  const tickers: TickerExchange[] = data.data.map((row) => ({
    cik: String(row[0]),
    name: row[1],
    ticker: row[2],
    exchange: row[3],
  }));

  tickerExchangeCache.set("all", tickers);
  return tickers;
}

// ── Screening ───────────────────────────────────────────────────────────────

export interface ScreeningFilters {
  exchange?: string;
  industry?: string;
  nameContains?: string;
  minHealthScore?: number;
  limit?: number;
}

export interface ScreenedCompany {
  cik: string;
  name: string;
  ticker: string;
  exchange: string;
  sic?: string;
  sicDescription?: string;
  healthScore?: number;
  healthGrade?: string;
}

export function listIndustries(): Array<{ key: string; label: string; sicRange: string }> {
  return Object.entries(SIC_INDUSTRIES).map(([key, val]) => ({
    key,
    label: val.label,
    sicRange: `${val.range[0]}-${val.range[1]}`,
  }));
}

/**
 * Screen companies through fast and deep filters.
 *
 * Fast filters (exchange, nameContains) run client-side over the full dataset.
 * Deep filters (industry, minHealthScore) require per-company API calls and
 * are applied to the top candidates from fast filtering.
 */
export async function screenCompanies(filters: ScreeningFilters): Promise<ScreenedCompany[]> {
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 50);
  const tickers = await loadTickerExchange();

  // Phase 1: Fast filters (instant, no API calls)
  let candidates = tickers;

  if (filters.exchange) {
    const ex = filters.exchange.toUpperCase();
    candidates = candidates.filter((t) => t.exchange.toUpperCase() === ex);
  }

  if (filters.nameContains) {
    const q = filters.nameContains.toLowerCase();
    candidates = candidates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.ticker.toLowerCase().includes(q)
    );
  }

  const needsDeepFilter = !!(filters.industry || filters.minHealthScore !== undefined);

  if (!needsDeepFilter) {
    return candidates.slice(0, limit).map((t) => ({
      cik: t.cik,
      name: t.name,
      ticker: t.ticker,
      exchange: t.exchange,
    }));
  }

  // Phase 2: Deep filters (requires per-company API calls)
  // Cap candidates to check — we scan more than limit to allow for filtering
  const scanLimit = Math.min(candidates.length, limit * 5);
  const toScan = candidates.slice(0, scanLimit);

  const results: ScreenedCompany[] = [];

  for (const t of toScan) {
    if (results.length >= limit) break;

    try {
      const entry: ScreenedCompany = {
        cik: t.cik,
        name: t.name,
        ticker: t.ticker,
        exchange: t.exchange,
      };

      // Industry filter: fetch submissions for SIC code
      if (filters.industry) {
        const submission = await getCompanyFilings(t.cik);
        entry.sic = submission.sic;
        entry.sicDescription = submission.sicDescription;

        if (!matchesSicGroup(submission.sic, filters.industry)) {
          continue;
        }
      }

      // Health score filter: run full financial analysis
      if (filters.minHealthScore !== undefined) {
        const analysis = await analyzeCompany(t.cik);
        entry.healthScore = analysis.healthScore?.score;
        entry.healthGrade = analysis.healthScore?.grade;

        if ((entry.healthScore ?? 0) < filters.minHealthScore) {
          continue;
        }
      }

      results.push(entry);
    } catch {
      // Skip companies that fail analysis (missing data, etc.)
      continue;
    }
  }

  return results;
}
