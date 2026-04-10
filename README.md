# Financial Hub MCP Server

A TypeScript MCP server for financial data aggregation. Connects any MCP-compatible AI assistant to SEC EDGAR filings, XBRL financial statements, FRED economic indicators, and real-time market data — with built-in XBRL normalization, fact deduplication, computed analytics, stock screening, and rate-limit protection.

## Core Concepts

### SEC EDGAR

All SEC EDGAR data comes directly from the SEC's free public APIs at `data.sec.gov`. No API key is required. The server automatically handles:

- **XBRL concept resolution** — Different companies use different XBRL tags for the same metric. The server normalizes across 20+ financial concepts (e.g., `revenue` resolves to `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`, and 11 other variants).
- **Fact deduplication** — Raw XBRL data contains duplicate values from overlapping 10-K/10-Q filings and amendments. The server collapses these to one clean value per fiscal period.
- **Rate limiting** — SEC enforces 10 requests/second. A token-bucket rate limiter with bounded queuing (max 50 pending, 30s timeout) prevents IP bans.

### FRED

FRED (Federal Reserve Economic Data) provides 800,000+ time series from 100+ sources. Requires a free API key from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html). Rate limited to 120 requests/minute (enforced via 2 req/s token bucket). Includes a curated catalog of ~50 essential economic indicators across 9 categories for zero-API-call browsing.

### Finnhub Market Data

Real-time stock quotes, company profiles, market news, insider transactions, and financial metrics via the [Finnhub API](https://finnhub.io). Free tier provides 30 API calls/second with no credit card required. The server rate-limits to 25 req/s to stay safely under the threshold. Quotes are never cached (stale prices are worse than no cache), while profiles (24h), news (5min), and financial metrics (1h) use appropriate TTLs.

### Caching

In-memory LRU cache with TTL expiry reduces redundant API calls:

| Cache | TTL | Max Entries | Payload Size |
|-------|-----|-------------|-------------|
| Company facts | 1 hour | 10 | 20-50 MB each |
| Company submissions | 1 hour | 30 | ~50 KB each |
| Company tickers | 24 hours | 1 | ~3 MB |
| FRED series metadata | 6 hours | 100 | ~1 KB each |
| FRED observations | 1 hour | 50 | ~5 KB each |
| Market profiles | 24 hours | 50 | ~1 KB each |
| Market news | 5 minutes | 10 | ~5 KB each |
| Insider transactions | 1 hour | 30 | ~3 KB each |
| Basic financials | 1 hour | 30 | ~2 KB each |

Eviction is LRU — frequently accessed entries are promoted on read, so the least recently used entry is evicted when capacity is full. Expired entries are proactively swept on every write.

## API

### Tools

- **search_companies**
  - Search SEC-registered companies by name or ticker
  - Input: `query` (string)
  - Returns matching company names, tickers, and CIK numbers

- **get_company_filings**
  - Get recent SEC filings for a company
  - Inputs:
    - `cik` (string): SEC's unique company identifier
    - `formType` (string, optional): Filter by form type (10-K, 10-Q, 8-K, DEF 14A)
  - Returns filing metadata: form type, dates, document links

- **get_financial_metric**
  - Get deduplicated historical values of a financial metric with trend analysis
  - Inputs:
    - `cik` (string): Company CIK number
    - `concept` (string): Friendly name or raw XBRL tag
    - `taxonomy` (string, optional): XBRL taxonomy (default: `us-gaap`)
    - `annualOnly` (boolean, optional): Return only annual data points
  - Accepts friendly names: `revenue`, `net_income`, `gross_profit`, `operating_income`, `eps`, `total_assets`, `total_liabilities`, `stockholders_equity`, `cash`, `long_term_debt`, `current_assets`, `current_liabilities`, `operating_cash_flow`, `capex`, `shares_outstanding`
  - Also accepts raw XBRL tags: `Revenues`, `NetIncomeLoss`, `Assets`, etc.
  - Returns deduplicated values (one per fiscal period), YoY growth rates, and trend direction

- **get_financial_summary**
  - Get a comprehensive financial snapshot with computed ratios
  - Input: `cik` (string)
  - Returns latest metrics: revenue, net income, assets, liabilities, equity, cash, debt, EPS, operating cash flow, free cash flow
  - Computed ratios: profit margin, debt-to-equity, current ratio, ROE, ROA
  - All values deduplicated from the most recent annual filing

- **get_company_facts_summary**
  - Get a compact index of all available XBRL data for a company
  - Inputs:
    - `cik` (string): Company CIK number
    - `limit` (number, optional): Max concepts to return (default 40, max 100)
  - Returns concept names, latest values, and data point counts — not the full time series
  - Use this to discover what data is available before drilling into specific metrics

- **analyze_financials**
  - Deep financial analysis with computed ratios, growth metrics, and health scoring
  - Input: `cik` (string)
  - Returns:
    - Financial ratios: profit margin, gross margin, operating margin, ROE, ROA, debt-to-equity, current ratio
    - Growth analysis: YoY rates, 3-year and 5-year CAGR, trend detection
    - Composite health grade (A-F) with explanatory factors
  - Uses `Promise.allSettled` internally — individual metric failures don't crash the analysis

- **compare_companies**
  - Side-by-side financial comparison of 2-5 companies
  - Input: `ciks` (string[], 2-5 CIK numbers)
  - Compares revenue, income, assets, cash, EPS, free cash flow, ratios, and health scores
  - Identifies winners by revenue, profitability, growth, and overall health
  - Individual company failures are isolated — partial comparisons still return

- **search_filings**
  - Full-text search across all SEC EDGAR filings with pagination
  - Inputs:
    - `query` (string): Search terms
    - `forms` (string, optional): Comma-separated form types
    - `startDate` (string, optional): YYYY-MM-DD
    - `endDate` (string, optional): YYYY-MM-DD
    - `limit` (number, optional): Results per page (default 20, max 50)
    - `offset` (number, optional): Skip N results for pagination
  - Returns results array + total hit count for pagination
  - Searches the full text of any filing since 2001

- **screen_stocks**
  - Screen SEC-registered companies by exchange, industry, name, and financial health
  - Inputs:
    - `exchange` (string, optional): Filter by exchange (e.g. NYSE, Nasdaq)
    - `industry` (string, optional): SIC industry group (technology, finance, healthcare, energy, manufacturing, retail, transportation, utilities, services, public_admin)
    - `nameContains` (string, optional): Case-insensitive substring match on company name
    - `minHealthScore` (number, optional): Minimum health grade (0-100) from financial analysis
    - `limit` (number, optional): Max results (default 20, max 50)
  - Two-phase screening: instant client-side filtering on 10,000+ companies, then optional deep filtering via SEC API for industry and health metrics

- **get_corporate_events**
  - Get recent 8-K corporate events with significance classification
  - Inputs:
    - `cik` (string): Company CIK number
    - `significance` (string, optional): Filter by `high`, `medium`, or `low` significance
    - `limit` (number, optional): Max events (default 15, max 50)
  - Classifies 25 SEC 8-K item numbers into human-readable categories with significance levels
  - High significance: CEO changes, M&A, bankruptcy, material agreements, auditor changes
  - Medium: earnings releases, departures, asset sales, amendments
  - Uses existing submissions data — zero additional API calls

- **search_economic_data**
  - Search the FRED database for economic data series
  - Input: `query` (string)
  - Returns series IDs, titles, frequencies, and units
  - Use returned series IDs with `get_economic_data`

- **get_economic_data**
  - Get time series observations for a FRED economic data series
  - Inputs:
    - `seriesId` (string): FRED series ID
    - `startDate` (string, optional): YYYY-MM-DD
    - `endDate` (string, optional): YYYY-MM-DD
  - Common series: `GDP`, `CPIAUCSL` (CPI), `UNRATE` (unemployment), `FEDFUNDS`, `DGS10` (10-year treasury), `SP500`, `MORTGAGE30US`

- **get_stock_quote**
  - Get a real-time stock price quote from Finnhub
  - Input: `symbol` (string): Stock ticker (e.g. AAPL, MSFT, GOOGL)
  - Returns current price, daily change, percent change, day high/low, open, and previous close
  - Live data — never cached

- **get_market_news**
  - Get latest financial news headlines
  - Inputs:
    - `symbol` (string, optional): Stock ticker for company-specific news. Omit for general market news
    - `category` (string, optional): `general`, `forex`, `crypto`, `merger` (only for general news)
  - Returns up to 20 articles with headline, summary, source, URL, and datetime

- **get_insider_transactions**
  - Get recent insider trading activity for a company
  - Input: `symbol` (string): Stock ticker (e.g. AAPL, TSLA)
  - Returns insider names, share counts, transaction dates, prices, and buy/sell codes
  - Transaction codes: P = Purchase, S = Sale, M = Option Exercise, A = Grant/Award, G = Gift, F = Tax withholding

- **get_company_overview**
  - Get a comprehensive company overview combining profile, market metrics, and peers
  - Input: `symbol` (string): Stock ticker (e.g. AAPL, MSFT)
  - Returns name, exchange, industry, market cap, PE ratio, beta, 52-week range, EPS, dividend yield, and peer tickers
  - Merges data from 4 parallel Finnhub API calls (profile, financials, peers, quote)

### Resources

- **sec://company/{ticker}**
  - Company profile with SEC metadata and recent filings
  - Includes: name, CIK, tickers, exchanges, SIC code, fiscal year end, and the 10 most recent filings
  - Browsable from any MCP client that supports resources

- **fred://catalog/{category}**
  - Browse curated FRED economic indicators by category
  - Categories: gdp, labor, inflation, rates, housing, markets, money, trade, consumer
  - Returns series IDs, titles, frequencies, and descriptions — zero API calls

- **fred://indicator/{seriesId}**
  - FRED indicator detail with latest observations
  - Returns series metadata from the catalog plus the 10 most recent data points
  - Use this to inspect a specific indicator before pulling full time series

### Prompts

- **financial_analysis**
  - Guided company financial health analysis
  - Input: `ticker` (string)
  - Walks through revenue trends, profitability, balance sheet health, and risk assessment

- **peer_comparison**
  - Side-by-side comparison of two companies
  - Input: `ticker1` (string), `ticker2` (string)

- **economic_overview**
  - Current US economic conditions dashboard
  - No input required
  - Pulls GDP, unemployment, CPI, fed funds rate, treasury yields, and mortgage rates

### Tool Annotations

All tools set [MCP ToolAnnotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#toolannotations) for safe agent composition:

| Hint | Value | Reason |
|------|-------|--------|
| `readOnlyHint` | `true` | All tools are read-only — no data is modified |
| `destructiveHint` | `false` | No data destruction |
| `idempotentHint` | `true` | Same inputs produce same outputs |
| `openWorldHint` | `true` | All tools make external API calls |

### Error Handling

All tools return MCP-compliant error envelopes with `isError: true` on failure:

```json
{
  "content": [{ "type": "text", "text": "SEC EDGAR request failed: 404 Not Found" }],
  "isError": true
}
```

This allows the LLM to receive semantic error messages, correct parameters, and retry — rather than receiving opaque transport-level JSON-RPC errors that break the agent loop.

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

### NPX

```json
{
  "mcpServers": {
    "financial-hub": {
      "command": "npx",
      "args": ["-y", "financial-hub-mcp"],
      "env": {
        "FRED_API_KEY": "your-free-api-key",
        "SEC_USER_AGENT_EMAIL": "your-email@example.com",
        "FINNHUB_API_KEY": "your-free-api-key"
      }
    }
  }
}
```

## Usage with VS Code

For manual installation, add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`, then add:

### NPX

```json
{
  "servers": {
    "financial-hub": {
      "command": "npx",
      "args": ["-y", "financial-hub-mcp"],
      "env": {
        "FRED_API_KEY": "your-free-api-key",
        "SEC_USER_AGENT_EMAIL": "your-email@example.com",
        "FINNHUB_API_KEY": "your-free-api-key"
      }
    }
  }
}
```

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SEC_USER_AGENT_EMAIL` | **Yes** | Your email address for SEC EDGAR API compliance. The server will **exit immediately** if this is not set — SEC EDGAR bans requests with missing or generic User-Agent headers. |
| `FRED_API_KEY` | For FRED tools | Free 32-character key from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html). The server starts without it but FRED tools will fail at runtime with a clear error message. |
| `FINNHUB_API_KEY` | For market tools | Free API key from [finnhub.io](https://finnhub.io/register). Required for stock quotes, market news, insider transactions, and company overviews. The server starts without it but market tools will fail at runtime. |

## Architecture

```
src/
├── index.ts              # Entry point — startup validation, MCP server init
├── rate-limiter.ts       # Token-bucket rate limiter with bounded queue + timeout
├── cache.ts              # In-memory TTL cache with proactive eviction
├── edgar/
│   ├── client.ts         # SEC EDGAR HTTP client (rate-limited, cached)
│   ├── tools.ts          # MCP tool registrations (12 tools, isError envelopes)
│   ├── resources.ts      # MCP resource templates (company profiles)
│   ├── xbrl.ts           # XBRL fact deduplication, growth, trend detection
│   ├── concepts.ts       # Concept alias normalization (20+ financial concepts)
│   ├── analytics.ts      # Computed ratios, health scoring, company comparison
│   ├── events.ts         # 8-K corporate event classification (25 item types)
│   └── screening.ts      # Stock screening by exchange, industry, health score
├── fred/
│   ├── client.ts         # FRED HTTP client (rate-limited, cached)
│   ├── tools.ts          # FRED MCP tool registrations
│   ├── catalog.ts        # Curated catalog of ~50 essential FRED indicators
│   └── resources.ts      # FRED MCP resource templates (catalog + indicators)
├── market/
│   ├── client.ts         # Finnhub HTTP client (rate-limited, cached)
│   └── tools.ts          # Market data MCP tool registrations (4 tools)
└── prompts.ts            # Financial analysis prompt templates
```

### Data Pipeline

Raw XBRL data from SEC EDGAR goes through several processing stages:

1. **Rate-limited fetch** — Token bucket ensures SEC's 10 req/s limit is never exceeded. Queue rejects after 50 pending requests or 30s wait.
2. **Caching** — Company facts cached for 1 hour, max 15 entries to avoid OOM on large payloads.
3. **Concept resolution** — Friendly names like `revenue` are mapped to all known XBRL tag variants across the us-gaap taxonomy.
4. **Deduplication** — Overlapping 10-K/10-Q/amendment values are collapsed to one per fiscal period. Prefers 10-K over 10-Q, latest filing date over earlier.
5. **Analysis** — Growth rates, CAGR, financial ratios, and health scores are computed from clean data.
6. **Serialization** — Minified JSON output to minimize context window usage.

## Building from Source

```bash
git clone https://github.com/ykshah1309/financial-hub-mcp.git
cd financial-hub-mcp
npm install
npm run build
```

Run locally:

```bash
FRED_API_KEY=your-key SEC_USER_AGENT_EMAIL=your-email FINNHUB_API_KEY=your-key node dist/index.js
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

## Badges 

[![MCP Badge](https://lobehub.com/badge/mcp/ykshah1309-financial-hub-mcp)](https://lobehub.com/mcp/ykshah1309-financial-hub-mcp)
