import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchCompanies, getCompanyFilings } from "./client.js";

export function registerEdgarResources(server: McpServer): void {
  server.registerResource(
    "company_profile",
    new ResourceTemplate("sec://company/{ticker}", {
      list: async () => ({
        resources: [
          {
            uri: "sec://company/AAPL",
            name: "Apple Inc.",
            description: "SEC filing profile for Apple Inc.",
            mimeType: "application/json",
          },
          {
            uri: "sec://company/MSFT",
            name: "Microsoft Corporation",
            description: "SEC filing profile for Microsoft Corporation",
            mimeType: "application/json",
          },
          {
            uri: "sec://company/GOOGL",
            name: "Alphabet Inc.",
            description: "SEC filing profile for Alphabet Inc.",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      description:
        "SEC EDGAR company profile with metadata and recent filings. " +
        "Use any ticker symbol (e.g. AAPL, MSFT, GOOGL).",
      mimeType: "application/json",
    },
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const ticker = String(variables.ticker);
      const matches = await searchCompanies(ticker);
      if (matches.length === 0) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `No company found for ticker: ${ticker}` }),
            },
          ],
        };
      }

      const company = matches[0];
      const submission = await getCompanyFilings(company.cik);

      const profile = {
        name: submission.name,
        cik: submission.cik,
        tickers: submission.tickers,
        exchanges: submission.exchanges,
        sic: submission.sic,
        sicDescription: submission.sicDescription,
        stateOfIncorporation: submission.stateOfIncorporation,
        fiscalYearEnd: submission.fiscalYearEnd,
        recentFilings: submission.filings.slice(0, 10),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(profile),
          },
        ],
      };
    }
  );
}
