/**
 * Finnhub Market Data API client.
 *
 * Provides real-time stock quotes, company profiles, market news,
 * insider transactions, and basic financial metrics.
 *
 * Free tier: 30 API calls/second, no credit card required.
 * API key: https://finnhub.io/register
 * Set via FINNHUB_API_KEY environment variable.
 */

import { finnhubLimiter, fetchWithRetry } from "../rate-limiter.js";
import {
  marketProfileCache,
  marketNewsCache,
  insiderCache,
  basicFinancialsCache,
} from "../cache.js";

const BASE = "https://finnhub.io/api/v1";

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    throw new Error(
      "FINNHUB_API_KEY environment variable is required for market data. " +
      "Get a free key at https://finnhub.io/register"
    );
  }
  return key;
}

async function finnhubFetch(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("token", getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetchWithRetry(url.toString(), {}, finnhubLimiter);
  if (!res.ok) {
    throw new Error(`Finnhub API request failed: ${res.status} ${res.statusText} (${endpoint})`);
  }
  return res.json();
}

// ── Public types ────────────────────────────────────────────────────────────

export interface StockQuote {
  current: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}

export interface CompanyProfile {
  name: string;
  ticker: string;
  exchange: string;
  finnhubIndustry: string;
  ipo: string;
  marketCapitalization: number;
  shareOutstanding: number;
  logo: string;
  weburl: string;
  country: string;
  currency: string;
}

export interface MarketNewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  category: string;
  image: string;
}

export interface InsiderTransaction {
  name: string;
  share: number;
  change: number;
  transactionDate: string;
  transactionCode: string;
  transactionPrice: number;
}

// ── API functions ───────────────────────────────────────────────────────────

/**
 * Get real-time stock quote. NOT cached — stale prices are worse than no cache.
 */
export async function getQuote(symbol: string): Promise<StockQuote> {
  const data = (await finnhubFetch("quote", { symbol: symbol.toUpperCase() })) as {
    c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number;
  };

  if (!data.c && data.c !== 0) {
    throw new Error(`No quote data available for symbol: ${symbol}`);
  }

  return {
    current: data.c,
    change: data.d,
    percentChange: data.dp,
    high: data.h,
    low: data.l,
    open: data.o,
    previousClose: data.pc,
    timestamp: data.t,
  };
}

/**
 * Get company profile. Cached 24h — rarely changes.
 */
export async function getCompanyProfile(symbol: string): Promise<CompanyProfile> {
  const upper = symbol.toUpperCase();
  const cached = marketProfileCache.get(`profile:${upper}`);
  if (cached) return cached;

  const data = (await finnhubFetch("stock/profile2", { symbol: upper })) as {
    name?: string; ticker?: string; exchange?: string; finnhubIndustry?: string;
    ipo?: string; marketCapitalization?: number; shareOutstanding?: number;
    logo?: string; weburl?: string; country?: string; currency?: string;
  };

  if (!data.name) {
    throw new Error(`No profile found for symbol: ${symbol}`);
  }

  const profile: CompanyProfile = {
    name: data.name ?? "",
    ticker: data.ticker ?? upper,
    exchange: data.exchange ?? "",
    finnhubIndustry: data.finnhubIndustry ?? "",
    ipo: data.ipo ?? "",
    marketCapitalization: data.marketCapitalization ?? 0,
    shareOutstanding: data.shareOutstanding ?? 0,
    logo: data.logo ?? "",
    weburl: data.weburl ?? "",
    country: data.country ?? "",
    currency: data.currency ?? "",
  };

  marketProfileCache.set(`profile:${upper}`, profile);
  return profile;
}

/**
 * Get peer company tickers. Cached alongside profile (24h).
 */
export async function getCompanyPeers(symbol: string): Promise<string[]> {
  const upper = symbol.toUpperCase();
  const cached = marketProfileCache.get(`peers:${upper}`);
  if (cached) return cached;

  const data = (await finnhubFetch("stock/peers", { symbol: upper })) as string[];
  const peers = (data ?? []).filter((p) => p !== upper);
  marketProfileCache.set(`peers:${upper}`, peers);
  return peers;
}

/**
 * Get general market news. Cached 5 min.
 */
export async function getMarketNews(category: string = "general"): Promise<MarketNewsItem[]> {
  const cacheKey = `news:market:${category}`;
  const cached = marketNewsCache.get(cacheKey);
  if (cached) return cached;

  const data = (await finnhubFetch("news", { category })) as Array<{
    headline?: string; summary?: string; source?: string; url?: string;
    datetime?: number; category?: string; image?: string;
  }>;

  const news: MarketNewsItem[] = (data ?? []).slice(0, 20).map((n) => ({
    headline: n.headline ?? "",
    summary: n.summary ?? "",
    source: n.source ?? "",
    url: n.url ?? "",
    datetime: n.datetime ?? 0,
    category: n.category ?? category,
    image: n.image ?? "",
  }));

  marketNewsCache.set(cacheKey, news);
  return news;
}

/**
 * Get company-specific news. Cached 5 min.
 */
export async function getCompanyNews(
  symbol: string,
  from: string,
  to: string
): Promise<MarketNewsItem[]> {
  const upper = symbol.toUpperCase();
  const cacheKey = `news:${upper}:${from}:${to}`;
  const cached = marketNewsCache.get(cacheKey);
  if (cached) return cached;

  const data = (await finnhubFetch("company-news", { symbol: upper, from, to })) as Array<{
    headline?: string; summary?: string; source?: string; url?: string;
    datetime?: number; category?: string; image?: string;
  }>;

  const news: MarketNewsItem[] = (data ?? []).slice(0, 20).map((n) => ({
    headline: n.headline ?? "",
    summary: n.summary ?? "",
    source: n.source ?? "",
    url: n.url ?? "",
    datetime: n.datetime ?? 0,
    category: n.category ?? "",
    image: n.image ?? "",
  }));

  marketNewsCache.set(cacheKey, news);
  return news;
}

/**
 * Get insider transactions. Cached 1h.
 */
export async function getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
  const upper = symbol.toUpperCase();
  const cached = insiderCache.get(`insider:${upper}`);
  if (cached) return cached;

  const data = (await finnhubFetch("stock/insider-transactions", { symbol: upper })) as {
    data?: Array<{
      name?: string; share?: number; change?: number;
      transactionDate?: string; transactionCode?: string; transactionPrice?: number;
    }>;
  };

  const transactions: InsiderTransaction[] = (data.data ?? []).slice(0, 30).map((t) => ({
    name: t.name ?? "",
    share: t.share ?? 0,
    change: t.change ?? 0,
    transactionDate: t.transactionDate ?? "",
    transactionCode: t.transactionCode ?? "",
    transactionPrice: t.transactionPrice ?? 0,
  }));

  insiderCache.set(`insider:${upper}`, transactions);
  return transactions;
}

/**
 * Get basic financial metrics (PE, beta, 52w range, etc.). Cached 1h.
 */
export async function getBasicFinancials(symbol: string): Promise<Record<string, number | null>> {
  const upper = symbol.toUpperCase();
  const cached = basicFinancialsCache.get(`fin:${upper}`);
  if (cached) return cached;

  const data = (await finnhubFetch("stock/metric", { symbol: upper, metric: "all" })) as {
    metric?: Record<string, number | null>;
  };

  const metrics = data.metric ?? {};
  basicFinancialsCache.set(`fin:${upper}`, metrics);
  return metrics;
}
