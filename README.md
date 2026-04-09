# Financial Hub MCP Server

A TypeScript MCP server for financial data aggregation — SEC EDGAR filings, XBRL financial statements, and FRED economic indicators. Connect any MCP-compatible AI assistant to real-time financial and economic data with zero cost.

## Features

- Search SEC-registered companies by name or ticker
- Retrieve SEC filings (10-K, 10-Q, 8-K, DEF 14A, etc.)
- Pull structured XBRL financial data (revenue, income, assets, EPS, etc.)
- **Smart XBRL normalization** — automatically resolves concept aliases across companies (e.g. `revenue` finds data whether a company uses `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, or `SalesRevenueNet`)
- **Fact deduplication** — removes duplicate values from overlapping 10-K/10-Q filings and amendments, returning one clean value per fiscal period
- **Computed financial ratios** — profit margin, ROE, ROA, debt-to-equity, current ratio
- **Growth analysis** — YoY growth rates, 3-year and 5-year CAGR, trend detection
- **Health scoring** — composite A-F grade based on profitability, leverage, liquidity, and growth
- **Cross-company comparison** — side-by-side normalized metrics for 2-5 companies
- Full-text search across all SEC EDGAR filings since 2001
- Search 800,000+ FRED economic time series
- Retrieve economic indicators (GDP, CPI, unemployment, interest rates)
- **Rate limiting** — built-in token-bucket rate limiter with request queuing prevents SEC (10 req/s) and FRED (120 req/min) bans
- **Intelligent caching** — in-memory TTL cache reduces redundant API calls
- MCP Resources for browsable company profiles
- MCP Prompts for guided financial analysis workflows
- Tool annotations on every tool

## Data Sources

### SEC EDGAR (No API key required)

All SEC EDGAR data comes directly from the SEC's free public APIs at `data.sec.gov`. No authentication needed — just a User-Agent with an email address (set via `SEC_USER_AGENT_EMAIL`).

**Rate limit**: 10 requests/second (enforced by SEC).

### FRED (Free API key)

FRED (Federal Reserve Economic Data) provides 800,000+ time series from 100+ sources. A free API key is required — get one instantly at [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html).

**Rate limit**: 120 requests/minute.

## API

### Tools

- **search_companies**
  - Search SEC-registered companies by name or ticker
  - Input: `query` (string)
  - Returns matching company names, tickers, and CIK numbers

- **get_company_filings**
  - Get recent SEC filings for a company
  - Input: `cik` (string), `formType` (optional string)
  - Returns filing metadata: form type, dates, document links
  - Filter by form type (10-K, 10-Q, 8-K, DEF 14A, etc.)

- **get_financial_metric**
  - Get deduplicated historical values of a financial metric with trend analysis
  - Input: `cik` (string), `concept` (string), `taxonomy` (optional), `annualOnly` (optional boolean)
  - Accepts friendly names (`revenue`, `net_income`, `eps`, `cash`, `total_assets`) or raw XBRL tags
  - Automatically resolves concept aliases — finds the right tag regardless of which one a company uses
  - Returns deduplicated values (one per fiscal period), YoY growth rates, and trend direction

- **get_financial_summary**
  - Get a comprehensive financial snapshot with computed ratios
  - Input: `cik` (string)
  - Returns latest metrics: revenue, net income, assets, liabilities, equity, cash, debt, EPS, operating cash flow, free cash flow
  - Computed ratios: profit margin, debt-to-equity, current ratio, ROE, ROA
  - All values deduplicated from the most recent annual filing

- **get_company_facts_summary**
  - Get a compact index of all available XBRL data for a company
  - Input: `cik` (string), `limit` (optional, default 40)
  - Returns concept names, latest values, and data point counts — not the full time series
  - Use this to discover what data is available before drilling into specific metrics

- **analyze_financials**
  - Deep financial analysis with computed ratios, growth metrics, and health scoring
  - Input: `cik` (string)
  - Returns profit margins, ROE, ROA, debt-to-equity, current ratio
  - Revenue/income/EPS growth with CAGR and trend detection
  - Composite health grade (A-F) with explanatory factors

- **compare_companies**
  - Side-by-side financial comparison of 2-5 companies
  - Input: `ciks` (string array, 2-5 CIKs)
  - Compares revenue, income, assets, cash, ratios, and health scores
  - Identifies the winner in each category

- **search_filings**
  - Full-text search across all SEC EDGAR filings
  - Input: `query` (string), `forms` (optional), `startDate` (optional), `endDate` (optional)
  - Search for keywords in the full text of any filing since 2001

- **search_economic_data**
  - Search the FRED database for economic data series
  - Input: `query` (string)
  - Returns series IDs, titles, frequencies, and units
  - Use returned series IDs with `get_economic_data`

- **get_economic_data**
  - Get time series observations for a FRED economic data series
  - Input: `seriesId` (string), `startDate` (optional), `endDate` (optional)
  - Common series: `GDP`, `CPIAUCSL` (CPI), `UNRATE` (unemployment), `FEDFUNDS`, `DGS10` (10-year treasury), `SP500`, `MORTGAGE30US`
  - Returns series metadata and recent observations

### Resources

- **sec://company/{ticker}**
  - Company profile with SEC metadata and recent filings
  - Includes: name, CIK, tickers, exchanges, SIC code, fiscal year end, and the 10 most recent filings
  - Browsable from any MCP client that supports resources

### Prompts

- **financial_analysis**
  - Guided company financial health analysis
  - Input: `ticker` (string)
  - Walks through revenue trends, profitability, balance sheet health, and risk assessment

- **peer_comparison**
  - Side-by-side comparison of two companies
  - Input: `ticker1` (string), `ticker2` (string)
  - Compares revenue, income, assets, liabilities, cash, and EPS

- **economic_overview**
  - Current US economic conditions dashboard
  - No input required
  - Pulls GDP, unemployment, CPI, fed funds rate, treasury yields, and mortgage rates

### Tool Annotations

All tools include MCP ToolAnnotations for safe agent composition:

| Hint | Value | Reason |
|------|-------|--------|
| `readOnlyHint` | `true` | All tools are read-only — no data is modified |
| `destructiveHint` | `false` | No data destruction |
| `idempotentHint` | `true` | Same inputs produce same outputs |
| `openWorldHint` | `true` | All tools make external API calls |

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

### NPX

```json
{
  "mcpServers": {
    "financial-hub": {
      "command": "npx",
      "args": ["-y", "financial-hub-mcp"],
      "env": {
        "FRED_API_KEY": "your-free-api-key",
        "SEC_USER_AGENT_EMAIL": "your-email@example.com"
      }
    }
  }
}
```

## VS Code Installation

Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`, then add:

### NPX

```json
{
  "servers": {
    "financial-hub": {
      "command": "npx",
      "args": ["-y", "financial-hub-mcp"],
      "env": {
        "FRED_API_KEY": "your-free-api-key",
        "SEC_USER_AGENT_EMAIL": "your-email@example.com"
      }
    }
  }
}
```

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FRED_API_KEY` | For FRED tools | Free 32-character key from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `SEC_USER_AGENT_EMAIL` | Recommended | Your email address for SEC EDGAR API compliance. Falls back to `user@example.com` if not set. |

SEC EDGAR tools work without any API key. The email in the User-Agent header is required by SEC policy for fair access.

## Architecture

```
src/
├── index.ts              # MCP server entry point
├── rate-limiter.ts       # Token-bucket rate limiter with retry/backoff
├── cache.ts              # In-memory TTL cache (facts, submissions, FRED data)
├── edgar/
│   ├── client.ts         # SEC EDGAR HTTP client (rate-limited, cached)
│   ├── tools.ts          # MCP tool registrations (10 tools)
│   ├── resources.ts      # MCP resource templates (company profiles)
│   ├── xbrl.ts           # XBRL fact deduplication, growth, trend detection
│   ├── concepts.ts       # Concept alias normalization (20+ financial concepts)
│   └── analytics.ts      # Computed ratios, health scoring, company comparison
├── fred/
│   ├── client.ts         # FRED HTTP client (rate-limited, cached)
│   └── tools.ts          # FRED MCP tool registrations
└── prompts.ts            # Financial analysis prompt templates
```

### Data Pipeline

Raw XBRL data from SEC EDGAR goes through several processing stages:

1. **Rate-limited fetch** — Token bucket ensures SEC's 10 req/s limit is never exceeded
2. **Caching** — Company facts cached for 1 hour to avoid redundant requests
3. **Concept resolution** — Friendly names like `revenue` are mapped to all known XBRL tag variants
4. **Deduplication** — Overlapping 10-K/10-Q/amendment values are collapsed to one per fiscal period
5. **Analysis** — Growth rates, CAGR, financial ratios, and health scores are computed
6. **Formatting** — Large numbers formatted (e.g. `1.23B`), responses capped to control context window usage

## Building from Source

```bash
git clone https://github.com/ykshah1309/financial-hub-mcp.git
cd financial-hub-mcp
npm install
npm run build
```

Run locally:

```bash
FRED_API_KEY=your-key SEC_USER_AGENT_EMAIL=your-email node dist/index.js
```

## License

MIT
