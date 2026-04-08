# financial-hub-mcp

An MCP server for financial data — SEC EDGAR filings, XBRL financial statements, and FRED economic indicators.

## Features

### SEC EDGAR (no API key required)

| Tool | Description |
|------|-------------|
| `search_companies` | Search for companies by name or ticker |
| `get_company_filings` | Get recent SEC filings (10-K, 10-Q, 8-K, etc.) |
| `get_financial_metric` | Get historical XBRL data for a specific metric |
| `get_financial_summary` | Quick snapshot: revenue, income, assets, liabilities |
| `search_filings` | Full-text search across all SEC filings |

### FRED Economic Data (free API key)

| Tool | Description |
|------|-------------|
| `search_economic_data` | Search 800,000+ economic time series |
| `get_economic_data` | Get observations for GDP, CPI, unemployment, rates, etc. |

### Resources

| URI Pattern | Description |
|-------------|-------------|
| `sec://company/{ticker}` | Company profile with metadata and recent filings |

### Prompts

| Prompt | Description |
|--------|-------------|
| `financial_analysis` | Guided company financial health analysis |
| `peer_comparison` | Side-by-side comparison of two companies |
| `economic_overview` | Current US economic conditions dashboard |

## Installation

```bash
npx financial-hub-mcp
```

Or install globally:

```bash
npm install -g financial-hub-mcp
financial-hub-mcp
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "financial-hub": {
      "command": "npx",
      "args": ["-y", "financial-hub-mcp"],
      "env": {
        "FRED_API_KEY": "your-free-key-here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FRED_API_KEY` | For FRED tools | Free key from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |

SEC EDGAR tools work without any API key.

## Tool Annotations

All tools include MCP ToolAnnotations:
- All tools are `readOnlyHint: true` — no data is modified
- All tools are `openWorldHint: true` — they make external API calls
- All tools are `idempotentHint: true` — same inputs produce same outputs
- All tools are `destructiveHint: false` — no data destruction

## License

MIT
