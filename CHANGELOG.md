# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-04-16

### Changed
- Repository hardening to match open-source MCP server conventions: added `LICENSE` (MIT), `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `.github/workflows/` for CI + npm publish on release.
- `package.json` enriched with `keywords`, `homepage`, `bugs`, `engines`, and a `prepublishOnly` build gate.

### Fixed
- `test-live.mjs` and `test-results.txt` removed from version control and added to `.gitignore`. They leaked the full live-call matrix (exact endpoints, tickers, series IDs, response shapes) of every tool, which is useful to anyone cloning the API surface. Retained locally but no longer tracked.

## [1.3.0] - 2026-04-09

### Added
- **8-K event extraction** — structured parsing of 8-K filings into typed events (item 1.01 through 9.01), with amendment reconciliation.
- **Stock screening** — multi-factor screener over the SEC company universe (market cap, P/E, revenue growth, sector), returning ranked candidates.
- **FRED catalog** — curated ~50 essential economic indicators across 9 categories (GDP, inflation, employment, rates, housing, trade, etc.), browsable with zero API calls.
- **Finnhub market data** — real-time quotes, company profiles, market news, insider transactions, and financial metrics. New `FINNHUB_API_KEY` environment variable (optional).

## [1.2.2] - 2026-04-08

### Fixed
- **FRED auth** — API key now forwarded correctly to all FRED endpoints (previously dropped on release/search paths).
- **Concept resolution** — unresolved XBRL concepts now fall back through the alias chain instead of returning empty.
- **CIK typing** — CIK normalized to 10-digit zero-padded string across all EDGAR calls; mixed-type inputs no longer cause cache misses.
- **Observation order** — FRED observations now always returned in ascending chronological order regardless of the upstream `sort_order` default.

## [1.2.1] - 2026-04-08

### Changed
- Replaced unbounded response-cache map with an LRU cache (bounded entries + TTL), preventing memory growth on long-running sessions.
- Tightened type coverage on the EDGAR and FRED clients — eliminated implicit `any`s in the response paths.
- FRED API key is no longer logged or included in error messages.
- Tests now cover rate-limiter backpressure, LRU eviction, and FRED auth edge cases.

## [1.2.0] - 2026-04-08

### Added
- Full MCP spec compliance: structured error responses, tool annotations, resource + prompt exposure.
- Safety: bounded concurrency, rate-limiter queue cap (max 50 pending, 30s timeout) to prevent ban storms.
- Memory: LRU-based caches with explicit TTLs per payload class (company facts 1h / submissions 1h / quotes no-cache / profiles 24h / news 5min / metrics 1h).

### Fixed
- Long-running session memory leak from unbounded submission cache.
- Rate-limiter deadlock when queue grew faster than drain rate.

## [1.1.0] - 2026-04-05

### Added
- Token-bucket rate limiter enforcing SEC's 10 req/s ceiling with bounded queuing.
- XBRL intelligence layer: cross-company concept normalization (20+ canonical metrics, e.g. `revenue` → `Revenues` / `RevenueFromContractWithCustomerExcludingAssessedTax` / `SalesRevenueNet` + 11 variants), fiscal-period deduplication across 10-K/10-Q overlaps and amendments.
- Analytics engine: computed metrics (growth rates, margins, YoY deltas) layered on top of the normalized XBRL facts.

## [1.0.0] - 2026-04-03

### Added
- Initial MCP server with stdio transport.
- SEC EDGAR client: filings index, company facts (XBRL), submissions, concept lookup — uses `data.sec.gov` public APIs with compliant `User-Agent` header.
- FRED client: series search, observations, release calendar (requires free `FRED_API_KEY`).
- MCP tool surface for all of the above, plus resource + prompt exposure for common queries.
