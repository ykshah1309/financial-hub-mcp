/**
 * FRED MCP Resources — browsable economic indicator catalog.
 *
 * Exposes two resource types:
 *   fred://catalog/{category} — lists available series by economic category
 *   fred://indicator/{seriesId} — series metadata + latest observations
 *
 * The catalog is hardcoded (~50 essential series) so discovery requires
 * zero API calls. Reading an indicator fetches live data from FRED.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FRED_CATALOG, getAllCategories, getCatalogByCategory, getCatalogEntry } from "./catalog.js";
import { getObservations } from "./client.js";

export function registerFredResources(server: McpServer): void {
  // ── fred://catalog/{category} ─────────────────────────────────────────────

  server.registerResource(
    "fred_catalog",
    new ResourceTemplate("fred://catalog/{category}", {
      list: async () => ({
        resources: getAllCategories().map((cat) => {
          const entries = getCatalogByCategory(cat);
          return {
            uri: `fred://catalog/${cat}`,
            name: `FRED: ${cat.charAt(0).toUpperCase() + cat.slice(1)} Indicators`,
            description: `${entries.length} economic series — ${entries.map((e) => e.seriesId).join(", ")}`,
            mimeType: "application/json",
          };
        }),
      }),
    }),
    {
      description:
        "Browse FRED economic indicator categories. Available categories: " +
        getAllCategories().join(", ") + ". " +
        "Each category contains curated series IDs for use with get_economic_data.",
      mimeType: "application/json",
    },
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const category = String(variables.category);
      const entries = getCatalogByCategory(category);

      if (entries.length === 0) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              status: "not_found",
              message: `Unknown category: ${category}. Available: ${getAllCategories().join(", ")}`,
            }),
          }],
        };
      }

      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            category,
            count: entries.length,
            series: entries,
          }),
        }],
      };
    }
  );

  // ── fred://indicator/{seriesId} ───────────────────────────────────────────

  server.registerResource(
    "fred_indicator",
    new ResourceTemplate("fred://indicator/{seriesId}", {
      list: async () => ({
        resources: FRED_CATALOG.map((entry) => ({
          uri: `fred://indicator/${entry.seriesId}`,
          name: entry.title,
          description: `[${entry.category}] ${entry.description} (${entry.frequency}, ${entry.unit})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description:
        "FRED economic indicator with metadata and recent observations. " +
        "Use any series ID from the catalog (e.g. GDP, CPIAUCSL, DGS10, UNRATE). " +
        "Returns the latest data points from the Federal Reserve.",
      mimeType: "application/json",
    },
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const seriesId = String(variables.seriesId);

      try {
        const catalogEntry = getCatalogEntry(seriesId);
        const data = await getObservations(seriesId, undefined, undefined, 30);

        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              seriesId,
              ...(catalogEntry ? {
                title: catalogEntry.title,
                category: catalogEntry.category,
                unit: catalogEntry.unit,
                description: catalogEntry.description,
              } : {}),
              frequency: data.series.frequency,
              lastUpdated: data.series.lastUpdated,
              latestValue: data.observations.length > 0
                ? data.observations[data.observations.length - 1]
                : null,
              recentObservations: data.observations.slice(-10),
            }),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              status: "error",
              message: `Failed to fetch indicator ${seriesId}: ${message}`,
            }),
          }],
        };
      }
    }
  );
}
