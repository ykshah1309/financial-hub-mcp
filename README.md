# Financial Hub MCP Server

A TypeScript MCP server for financial data aggregation. Connects any MCP-compatible AI assistant to SEC EDGAR filings, structured XBRL financial statements, and FRED economic indicators — with built-in XBRL normalization, fact deduplication, computed analytics, and rate-limit protection.

## Core Concepts

### SEC EDGAR

All SEC EDGAR data comes directly from the SEC's free public APIs at `data.sec.gov`. No API key is required. The server automatically handles:

- **XBRL concept resolution** — Different companies use different XBRL tags for the same metric. The server normalizes across 20+ financial concepts (e.g., `revenue` resolves to `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`, and 11 other variants).
- **Fact deduplication** — Raw XBRL data contains duplicate values from overlapping 10-K/10-Q filings and amendments. The server collapses these to one clean value per fiscal period.
- **Rate limiting** — SEC enforces 10 requests/second. A token-bucket rate limiter with bounded queuing (max 50 pending, 30s timeout) prevents IP bans.

### FRED

FRED (Federal Reserve Economic Data) provides 800,000+ time series from 100+ sources. Requires a free API key from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html). Rate limited to 120 requests/minute (enforced via 2 req/s token bucket).

### Caching

In-memory TTL cache reduces redundant API calls:

| Cache | TTL | Max Entries | Payload Size |
|-------|-----|-------------|-------------|
| Company facts | 1 hour | 15 | 20-50 MB each |
| Company submissions | 1 hour | 30 | ~50 KB each |
| FRED series metadata | 6 hours | 100 | ~1 KB each |
| FRED observations | 1 hour | 50 | ~5 KB each |

Entries are proactively swept on every write to prevent memory buildup from lazy-only deletion.

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
  - Full-text search across all SEC EDGAR filings
  - Inputs:
    - `query` (string): Search terms
    - `forms` (string, optional): Comma-separated form types
    - `startDate` (string, optional): YYYY-MM-DD
    - `endDate` (string, optional): YYYY-MM-DD
  - Searches the full text of any filing since 2001

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
        "SEC_USER_AGENT_EMAIL": "your-email@example.com"
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
| `SEC_USER_AGENT_EMAIL` | **Yes** | Your email address for SEC EDGAR API compliance. The server will **exit immediately** if this is not set — SEC EDGAR bans requests with missing or generic User-Agent headers. |
| `FRED_API_KEY` | For FRED tools | Free 32-character key from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html). The server starts without it but FRED tools will fail at runtime with a clear error message. |

## Architecture

```
src/
├── index.ts              # Entry point — startup validation, MCP server init
├── rate-limiter.ts       # Token-bucket rate limiter with bounded queue + timeout
├── cache.ts              # In-memory TTL cache with proactive eviction
├── edgar/
│   ├── client.ts         # SEC EDGAR HTTP client (rate-limited, cached)
│   ├── tools.ts          # MCP tool registrations (10 tools, isError envelopes)
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
FRED_API_KEY=your-key SEC_USER_AGENT_EMAIL=your-email node dist/index.js
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
