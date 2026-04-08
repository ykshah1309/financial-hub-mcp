/**
 * SEC EDGAR API client.
 *
 * All endpoints on data.sec.gov are free, require no API key, and return JSON.
 * The only requirement is a descriptive User-Agent header.
 * Rate limit: 10 requests/second (enforced by SEC).
 *
 * References:
 *   https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 *   https://www.sec.gov/about/developer-resources
 */

const BASE = "https://data.sec.gov";
const EFTS_BASE = "https://efts.sec.gov/LATEST";
const USER_AGENT =
  "financial-hub-mcp/1.0 (https://github.com/ykshah1309/financial-hub-mcp)";

// ── helpers ──────────────────────────────────────────────────────────────────

async function edgarFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

/** Zero-pad a CIK to 10 digits. */
function padCik(cik: string | number): string {
  return String(cik).padStart(10, "0");
}

// ── public types ─────────────────────────────────────────────────────────────

export interface CompanyTicker {
  cik: number;
  ticker: string;
  name: string;
}

export interface Filing {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
}

export interface CompanySubmission {
  cik: string;
  entityType: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  stateOfIncorporation: string;
  fiscalYearEnd: string;
  filings: Filing[];
}

export interface XBRLFact {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

export interface CompanyConcept {
  cik: number;
  taxonomy: string;
  tag: string;
  label: string;
  description: string;
  units: Record<string, XBRLFact[]>;
}

export interface SearchResult {
  name: string;
  ticker: string;
  cik: number;
}

// ── API functions ────────────────────────────────────────────────────────────

/**
 * Search companies by name or ticker.
 * Uses the company_tickers.json endpoint, filtered client-side.
 */
let tickerCache: CompanyTicker[] | null = null;

export async function searchCompanies(query: string): Promise<SearchResult[]> {
  if (!tickerCache) {
    const data = (await edgarFetch(
      "https://www.sec.gov/files/company_tickers.json"
    )) as Record<string, { cik_str: number; ticker: string; title: string }>;
    tickerCache = Object.values(data).map((entry) => ({
      cik: entry.cik_str,
      ticker: entry.ticker,
      name: entry.title,
    }));
  }

  const q = query.toLowerCase();
  return tickerCache
    .filter(
      (c) =>
        c.ticker.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    )
    .slice(0, 20)
    .map((c) => ({ name: c.name, ticker: c.ticker, cik: c.cik }));
}

/**
 * Get a company's submission history (metadata + recent filings).
 */
export async function getCompanyFilings(
  cik: string | number,
  formType?: string
): Promise<CompanySubmission> {
  const data = (await edgarFetch(
    `${BASE}/submissions/CIK${padCik(cik)}.json`
  )) as any;

  const recent = data.filings?.recent ?? {};
  const count = recent.accessionNumber?.length ?? 0;

  let filings: Filing[] = [];
  for (let i = 0; i < count; i++) {
    filings.push({
      accessionNumber: recent.accessionNumber[i],
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i] ?? "",
      form: recent.form[i],
      primaryDocument: recent.primaryDocumentUrl?.[i] ?? recent.primaryDocument?.[i] ?? "",
      primaryDocDescription: recent.primaryDocDescription?.[i] ?? "",
    });
  }

  if (formType) {
    const ft = formType.toUpperCase();
    filings = filings.filter((f) => f.form === ft);
  }

  return {
    cik: padCik(data.cik),
    entityType: data.entityType ?? "",
    name: data.name ?? "",
    tickers: data.tickers ?? [],
    exchanges: data.exchanges ?? [],
    sic: data.sic ?? "",
    sicDescription: data.sicDescription ?? "",
    stateOfIncorporation: data.stateOfIncorporation ?? "",
    fiscalYearEnd: data.fiscalYearEnd ?? "",
    filings: filings.slice(0, 25),
  };
}

/**
 * Get XBRL financial data for a specific concept (e.g. Revenue, NetIncomeLoss).
 *
 * Example concepts:
 *   us-gaap / Revenues
 *   us-gaap / NetIncomeLoss
 *   us-gaap / Assets
 *   us-gaap / Liabilities
 *   us-gaap / StockholdersEquity
 *   us-gaap / EarningsPerShareBasic
 */
export async function getCompanyConcept(
  cik: string | number,
  concept: string,
  taxonomy: string = "us-gaap"
): Promise<CompanyConcept> {
  const data = (await edgarFetch(
    `${BASE}/api/xbrl/companyconcept/CIK${padCik(cik)}/${taxonomy}/${concept}.json`
  )) as any;

  return {
    cik: data.cik,
    taxonomy: data.taxonomy,
    tag: data.tag,
    label: data.label ?? "",
    description: data.description ?? "",
    units: data.units ?? {},
  };
}

/**
 * Get all XBRL company facts at once (all concepts).
 */
export async function getCompanyFacts(
  cik: string | number
): Promise<Record<string, Record<string, CompanyConcept>>> {
  const data = (await edgarFetch(
    `${BASE}/api/xbrl/companyfacts/CIK${padCik(cik)}.json`
  )) as any;

  return data.facts ?? {};
}

/**
 * Full-text search across all SEC filings.
 */
export async function searchFilings(
  query: string,
  forms?: string,
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  const params = new URLSearchParams({ q: query });
  if (forms) params.set("forms", forms);
  if (startDate) params.set("startdt", startDate);
  if (endDate) params.set("enddt", endDate);

  const data = (await edgarFetch(
    `${EFTS_BASE}/search-index?${params.toString()}`
  )) as any;

  const hits = data.hits?.hits ?? [];
  return hits.slice(0, 20).map((hit: any) => ({
    companyName: hit._source?.company_name ?? "",
    ticker: hit._source?.ticker ?? "",
    form: hit._source?.form_type ?? "",
    filingDate: hit._source?.file_date ?? "",
    description: hit._source?.file_description ?? "",
  }));
}
