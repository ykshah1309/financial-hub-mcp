# Contributing

Thanks for your interest in `financial-hub-mcp`. This project follows the conventions used across the [modelcontextprotocol](https://github.com/modelcontextprotocol) organisation.

## Ground rules

- **MIT** for all contributions. By submitting a PR you agree to license your work under it.
- **No `console.log`.** stdio MCP reserves stdout for JSON-RPC. Write diagnostics to stderr.
- **Respect upstream rate limits.** SEC EDGAR enforces 10 req/s and bans IPs that exceed it; FRED caps at 120 req/min; Finnhub free tier is 30 req/s. Any new client code must go through the existing rate-limiter.
- **Additions need tests.** `src/**` changes should come with a unit test (vitest). Integration tests that hit live APIs live outside the public repo — don't commit them.
- **Cache responsibly.** The LRU is bounded for a reason: SEC `companyfacts` payloads are 20–50 MB each. New cache entries must declare a TTL and a max-entries cap.

## Development loop

```bash
npm install
npm run dev       # tsc --watch
npm test          # vitest
npm run lint      # tsc --noEmit
```

Environment variables for local runs:

```bash
FRED_API_KEY=<free key from fred.stlouisfed.org>
SEC_USER_AGENT_EMAIL=<your email>         # optional but polite
FINNHUB_API_KEY=<free key from finnhub.io> # optional, enables market tools
```

## Commit style

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`. Keep the subject < 72 chars. Body explains *why*, not *what*.

## Pull request checklist

- [ ] `npm run lint` passes (typecheck)
- [ ] `npm test` passes
- [ ] No new `console.log` / stray stdout writes
- [ ] No new unbounded caches or unthrottled upstream calls
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if user-visible
- [ ] Docs updated (README tool table, config env vars, or tool descriptions) if surface changed

## Reporting issues

Please include: OS, Node version, the exact env vars set (redact secrets), the MCP client used (Claude Desktop / Cursor / other), and a minimal repro — ideally the tool name and arguments that reproduced the problem.
