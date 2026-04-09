/**
 * FRED (Federal Reserve Economic Data) API client.
 *
 * Requires a free API key from https://fred.stlouisfed.org/docs/api/api_key.html
 * Set via FRED_API_KEY environment variable.
 *
 * Rate limit: 120 requests/minute.
 */

import { fredLimiter, fetchWithRetry } from "../rate-limiter.js";
import { fredSeriesCache, fredObsCache } from "../cache.js";

const BASE = "https://api.stlouisfed.org/fred";

function getApiKey(): string {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    throw new Error(
      "FRED_API_KEY environment variable is required. " +
        "Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html"
    );
  }
  return key;
}

async function fredFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("file_type", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetchWithRetry(url.toString(), {}, fredLimiter);
  if (!res.ok) {
    throw new Error(`FRED API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── public types ─────────────────────────────────────────────────────────────

export interface FredSeries {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonalAdjustment: string;
  lastUpdated: string;
  notes: string;
}

export interface FredObservation {
  date: string;
  value: string;
}

export interface FredSearchResult {
  id: string;
  title: string;
  frequency: string;
  units: string;
  popularity: number;
}

// ── API functions ────────────────────────────────────────────────────────────

/**
 * Search for FRED economic data series.
 */
export async function searchSeries(query: string, limit: number = 15): Promise<FredSearchResult[]> {
  const data = (await fredFetch("series/search", {
    search_text: query,
    limit: String(limit),
    order_by: "search_rank",
  })) as any;

  return (data.seriess ?? []).map((s: any) => ({
    id: s.id,
    title: s.title,
    frequency: s.frequency,
    units: s.units,
    popularity: s.popularity,
  }));
}

/**
 * Get metadata for a specific series.
 * Cached for 6 hours — series metadata rarely changes.
 */
export async function getSeriesInfo(seriesId: string): Promise<FredSeries> {
  const cacheKey = `series:${seriesId}`;
  const cached = fredSeriesCache.get(cacheKey);
  if (cached) return cached as FredSeries;

  const data = (await fredFetch("series", {
    series_id: seriesId,
  })) as any;

  const s = data.seriess?.[0];
  if (!s) throw new Error(`Series not found: ${seriesId}`);

  const info: FredSeries = {
    id: s.id,
    title: s.title,
    frequency: s.frequency,
    units: s.units,
    seasonalAdjustment: s.seasonal_adjustment,
    lastUpdated: s.last_updated,
    notes: s.notes ?? "",
  };
  fredSeriesCache.set(cacheKey, info);
  return info;
}

/**
 * Get observations (data points) for a series.
 *
 * Well-known series IDs:
 *   GDP          — Gross Domestic Product
 *   CPIAUCSL     — Consumer Price Index (All Urban Consumers)
 *   UNRATE       — Unemployment Rate
 *   FEDFUNDS     — Federal Funds Effective Rate
 *   DGS10        — 10-Year Treasury Constant Maturity Rate
 *   SP500        — S&P 500 Index
 *   DEXUSEU      — USD/EUR Exchange Rate
 *   MORTGAGE30US — 30-Year Fixed Rate Mortgage Average
 */
export async function getObservations(
  seriesId: string,
  startDate?: string,
  endDate?: string,
  limit: number = 60
): Promise<{ series: FredSeries; observations: FredObservation[] }> {
  const obsCacheKey = `obs:${seriesId}:${startDate ?? ""}:${endDate ?? ""}:${limit}`;
  const cached = fredObsCache.get(obsCacheKey);
  if (cached) return cached as { series: FredSeries; observations: FredObservation[] };

  const params: Record<string, string> = {
    series_id: seriesId,
    sort_order: "desc",
    limit: String(limit),
  };
  if (startDate) params.observation_start = startDate;
  if (endDate) params.observation_end = endDate;

  const [info, obsData] = await Promise.all([
    getSeriesInfo(seriesId),
    fredFetch("series/observations", params) as Promise<any>,
  ]);

  const observations: FredObservation[] = (obsData.observations ?? [])
    .filter((o: any) => o.value !== ".")
    .map((o: any) => ({
      date: o.date,
      value: o.value,
    }));

  const result = { series: info, observations };
  fredObsCache.set(obsCacheKey, result);
  return result;
}
