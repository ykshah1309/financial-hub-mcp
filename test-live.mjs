/**
 * Live integration test — calls real SEC EDGAR and FRED APIs.
 * Run: FRED_API_KEY=xxx SEC_USER_AGENT_EMAIL=you@email.com node test-live.mjs
 */

import { searchCompanies, getCompanyFilings, getCompanyConcept, getCompanyFacts } from "./dist/edgar/client.js";
import { searchFilings } from "./dist/edgar/client.js";
import { deduplicateFacts, annualOnly, computeGrowth, detectTrend, summarizeFacts } from "./dist/edgar/xbrl.js";
import { resolveConcept, findConceptData } from "./dist/edgar/concepts.js";
import { analyzeCompany, compareCompanies } from "./dist/edgar/analytics.js";
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
  console.log("\u2502  Financial Hub MCP \u2014 Live Integration Tests (v1.1.0)             \u2502");
  console.log("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n");

  // ── SEC EDGAR ────────────────────────────────────────────────────────────
  console.log("SEC EDGAR — Core API\n");

  await test("search_companies('Apple')", () => searchCompanies("Apple"));
  await test("search_companies('MSFT')", () => searchCompanies("MSFT"));
  await test("get_company_filings(320193, '10-K')", () => getCompanyFilings("320193", "10-K"));
  await test("get_company_concept(320193, 'Revenues')", () => getCompanyConcept("320193", "Revenues"));
  await test("search_filings('artificial intelligence', '10-K')", () => searchFilings("artificial intelligence", "10-K"));

  // ── XBRL Deduplication ───────────────────────────────────────────────────
  console.log("\nXBRL Intelligence — Dedup & Normalization\n");

  await test("concept alias: 'revenue' resolves to tag list", () => {
    const resolved = resolveConcept("revenue");
    if (resolved.tags.length < 2) throw new Error("Expected multiple tags");
    return { canonical: resolved.canonical, tagCount: resolved.tags.length, firstTag: resolved.tags[0] };
  });

  await test("concept alias: 'net_income' resolves", () => {
    const resolved = resolveConcept("net_income");
    return { canonical: resolved.canonical, tags: resolved.tags.slice(0, 3) };
  });

  const appleFacts = await test("get_company_facts(320193) + find revenue via alias", async () => {
    const facts = await getCompanyFacts("320193");
    const gaap = facts["us-gaap"] ?? {};
    const found = findConceptData(gaap, "revenue");
    if (!found) throw new Error("Could not find revenue for Apple");
    return { tag: found.tag, unit: found.unit, rawFactCount: found.facts.length };
  });

  await test("deduplicateFacts — Apple revenue", async () => {
    const facts = await getCompanyFacts("320193");
    const gaap = facts["us-gaap"] ?? {};
    const found = findConceptData(gaap, "revenue");
    const raw = found.facts;
    const clean = deduplicateFacts(raw);
    const annuals = annualOnly(clean);
    const growth = computeGrowth(annuals);
    const trend = detectTrend(growth);
    return { rawCount: raw.length, dedupedCount: clean.length, annualCount: annuals.length, trend };
  });

  await test("summarizeFacts — Apple top concepts", async () => {
    const facts = await getCompanyFacts("320193");
    const gaap = facts["us-gaap"] ?? {};
    const summary = summarizeFacts(gaap, 5);
    return summary.map((s) => ({ concept: s.concept, latest: s.latestValue, count: s.count }));
  });

  // ── Analytics ────────────────────────────────────────────────────────────
  console.log("\nAnalytics Engine\n");

  await test("analyze_financials(320193) [Apple]", async () => {
    const analysis = await analyzeCompany("320193");
    return {
      healthGrade: analysis.healthScore.grade,
      healthScore: analysis.healthScore.score,
      profitMargin: analysis.ratios.profitMargin,
      revenueTrend: analysis.growth.revenue?.trend,
      factors: analysis.healthScore.factors.slice(0, 3),
    };
  });

  await test("analyze_financials(789019) [Microsoft]", async () => {
    const analysis = await analyzeCompany("789019");
    return {
      healthGrade: analysis.healthScore.grade,
      healthScore: analysis.healthScore.score,
      roe: analysis.ratios.returnOnEquity,
      debtToEquity: analysis.ratios.debtToEquity,
    };
  });

  await test("compare_companies([Apple vs Microsoft])", async () => {
    const comparison = await compareCompanies(["320193", "789019"]);
    return {
      companiesCompared: comparison.companies.length,
      winner: comparison.winner,
      grades: comparison.companies.map((c) => ({ cik: c.cik, grade: c.healthGrade })),
    };
  });

  // ── FRED ──────────────────────────────────────────────────────────────
  console.log("\nFRED (api.stlouisfed.org)\n");

  await test("search_economic_data('GDP')", () => searchSeries("GDP"));
  await test("get_economic_data('UNRATE')", () => getObservations("UNRATE", undefined, undefined, 6));
  await test("get_economic_data('CPIAUCSL')", () => getObservations("CPIAUCSL", undefined, undefined, 6));
  await test("get_economic_data('FEDFUNDS')", () => getObservations("FEDFUNDS", undefined, undefined, 6));
  await test("get_economic_data('DGS10')", () => getObservations("DGS10", undefined, undefined, 6));

  // ── Rate Limiter (implicit) ──────────────────────────────────────────────
  console.log("\nRate Limiter — Stress Test\n");

  await test("rapid-fire 5 SEC calls (should not 429)", async () => {
    const promises = [
      searchCompanies("Google"),
      searchCompanies("Amazon"),
      searchCompanies("Tesla"),
      searchCompanies("Meta"),
      searchCompanies("Netflix"),
    ];
    const results = await Promise.all(promises);
    return { queriesCompleted: results.length, allSucceeded: results.every((r) => r.length > 0) };
  });

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(67)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`${"─".repeat(67)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
