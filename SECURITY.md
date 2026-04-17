# Security & Responsible Use

## Reporting vulnerabilities

Please **do not** open public issues for security reports. Email the maintainers directly (see `package.json` → `author`) with:

- A description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Any suggested mitigation

You can expect an acknowledgement within 72 hours.

## Handling of API keys

This server accepts three environment variables that may contain secrets:

| Variable | Required | Purpose |
|---|---|---|
| `FRED_API_KEY` | yes (for FRED tools) | Federal Reserve Economic Data |
| `FINNHUB_API_KEY` | no | Real-time quotes / market data |
| `SEC_USER_AGENT_EMAIL` | no | Identifier, not a secret |

- Keys are read from the process environment at startup and never written to stdout (stdout is reserved for JSON-RPC).
- Keys are never echoed in error messages, log lines, or tool responses.
- Keys are not persisted to disk by this server.

If you believe a release has leaked a key through logs or errors, treat it as a security bug and use the private reporting channel above.

## Responsible use policy

This server exposes public financial data (SEC EDGAR, FRED) and third-party market APIs (Finnhub) to AI agents. Intended use cases:

- Personal investment research and education
- Academic / journalistic analysis of public filings
- Building agentic workflows that respect upstream rate limits and terms

**Out of scope:**

- High-frequency polling that violates SEC EDGAR's 10 req/s policy or Finnhub's free-tier limits. The server rate-limits by default; **do not disable** the limiter.
- Redistributing FRED or Finnhub data in ways that violate their terms of service.
- Making investment decisions without independent verification. Cached and normalized data can lag the primary source.

## Operational security

- The LRU caches store filing payloads and quote data in memory only. Cached values are not written to disk.
- Running the server over untrusted network paths exposes API keys as environment variables to whoever controls the process — standard UNIX process isolation rules apply.
- The MCP stdio transport passes all tool inputs as JSON. Inputs are validated with zod schemas at the tool boundary; malformed inputs are rejected before reaching the upstream API.
