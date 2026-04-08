/**
 * Live integration test — calls real SEC EDGAR and FRED APIs.
 * Run: FRED_API_KEY=xxx SEC_USER_AGENT_EMAIL=you@email.com node test-live.mjs
 */

import { searchCompanies, getCompanyFilings, getCompanyConcept, getCompanyFacts, searchFilings } from "./dist/edgar/client.js";
import { searchSeries, getObservations } from "./dist/fred/client.js";

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    process.stdout.write(`  ${label} ... `);
    const result = await fn();
    const summary = JSON.stringify(result).slice(0, 120);
    console.log(`\u2705  ${summary}...`);
    passed++;
    return result;
  } catch (err) {
    console.log(`\u274c  ${err.message}`);
    failed++;
    return null;
  }
}

async function main() {
  console.log("\n\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
  console.log("\u2502  Financial Hub MCP \u2014 Live Integration Tests                     \u2502");
  console.log("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n");

  // ── SEC EDGAR ────────────────────────────────────────────────────────────
  console.log("SEC EDGAR (data.sec.gov)\n");

  await test("search_companies('Apple')", () => searchCompanies("Apple"));
  await test("search_companies('MSFT')", () => searchCompanies("MSFT"));
  await test("get_company_filings(320193, '10-K')", () => getCompanyFilings("320193", "10-K"));
  await test("get_financial_metric(320193, 'Revenues')", () => getCompanyConcept("320193", "Revenues"));
  await test("get_financial_metric(320193, 'NetIncomeLoss')", () => getCompanyConcept("320193", "NetIncomeLoss"));

  await test("get_company_facts(789019) [Microsoft]", async () => {
    const facts = await getCompanyFacts("789019");
    return { taxonomies: Object.keys(facts), tagCount: Object.keys(facts["us-gaap"] ?? {}).length };
  });

  await test("search_filings('artificial intelligence', '10-K')", () => searchFilings("artificial intelligence", "10-K"));

  // ── FRED ──────────────────────────────────────────────────────────────
  console.log("\nFRED (api.stlouisfed.org)\n");

  await test("search_economic_data('GDP')", () => searchSeries("GDP"));
  await test("get_economic_data('UNRATE')", () => getObservations("UNRATE", undefined, undefined, 6));
  await test("get_economic_data('CPIAUCSL')", () => getObservations("CPIAUCSL", undefined, undefined, 6));
  await test("get_economic_data('FEDFUNDS')", () => getObservations("FEDFUNDS", undefined, undefined, 6));
  await test("get_economic_data('DGS10')", () => getObservations("DGS10", undefined, undefined, 6));

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(67)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`${"─".repeat(67)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
