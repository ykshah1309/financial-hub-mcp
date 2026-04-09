/**
 * Live integration test — calls real SEC EDGAR and FRED APIs.
 * Run: FRED_API_KEY=xxx SEC_USER_AGENT_EMAIL=you@email.com node test-live.mjs
 *
 * Each test validates response structure and invariants, not just non-throwing.
 */

import { searchCompanies, getCompanyFilings, getCompanyConcept, getCompanyFacts } from "./dist/edgar/client.js";
import { searchFilings } from "./dist/edgar/client.js";
import { deduplicateFacts, annualOnly, computeGrowth, detectTrend, summarizeFacts } from "./dist/edgar/xbrl.js";
import { resolveConcept, findConceptData } from "./dist/edgar/concepts.js";
import { analyzeCompany, compareCompanies } from "./dist/edgar/analytics.js";
import { searchSeries, getObservations } from "./dist/fred/client.js";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

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
  console.log("\u2502  Financial Hub MCP \u2014 Live Integration Tests (v1.2.1)             \u2502");
  console.log("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n");

  // ── SEC EDGAR ────────────────────────────────────────────────────────────
  console.log("SEC EDGAR \u2014 Core API\n");

  await test("search_companies('Apple')", async () => {
    const results = await searchCompanies("Apple");
    assert(Array.isArray(results), "results should be an array");
    assert(results.length > 0, "should find at least one Apple match");
    assert(results[0].cik > 0, "CIK should be a positive number");
    assert(typeof results[0].ticker === "string", "ticker should be a string");
    return { count: results.length, first: results[0].ticker };
  });

  await test("search_companies('MSFT')", async () => {
    const results = await searchCompanies("MSFT");
    assert(results.length > 0, "should find MSFT");
    assert(results.some((r) => r.ticker === "MSFT"), "should include exact MSFT match");
    return { count: results.length };
  });

  await test("get_company_filings(320193, '10-K')", async () => {
    const sub = await getCompanyFilings("320193", "10-K");
    assert(typeof sub.cik === "string", "CIK should be a padded string");
    assert(sub.name.length > 0, "company name should not be empty");
    assert(Array.isArray(sub.filings), "filings should be an array");
    assert(sub.filings.length > 0, "Apple should have 10-K filings");
    assert(sub.filings.every((f) => f.form === "10-K"), "all filings should be 10-K");
    return { name: sub.name, filingCount: sub.filings.length };
  });

  await test("get_company_concept(320193, 'Revenues')", async () => {
    const concept = await getCompanyConcept("320193", "Revenues");
    assert(concept.tag === "Revenues", "tag should be Revenues");
    assert(Object.keys(concept.units).length > 0, "should have at least one unit");
    return { tag: concept.tag, unitCount: Object.keys(concept.units).length };
  });

  await test("search_filings('artificial intelligence', '10-K')", async () => {
    const response = await searchFilings("artificial intelligence", "10-K");
    assert(Array.isArray(response.results), "results should be an array");
    assert(response.results.length > 0, "should find filings mentioning AI");
    assert(typeof response.total === "number", "total should be a number");
    assert(response.total >= response.results.length, "total should be >= results length");
    return { count: response.results.length, total: response.total };
  });

  // ── XBRL Deduplication ───────────────────────────────────────────────────
  console.log("\nXBRL Intelligence \u2014 Dedup & Normalization\n");

  await test("concept alias: 'revenue' resolves to tag list", () => {
    const resolved = resolveConcept("revenue");
    assert(resolved.tags.length >= 2, "revenue should resolve to multiple tags");
    assert(resolved.canonical === "revenue", "canonical should be 'revenue'");
    assert(resolved.tags.includes("Revenues"), "should include 'Revenues' tag");
    return { canonical: resolved.canonical, tagCount: resolved.tags.length, firstTag: resolved.tags[0] };
  });

  await test("concept alias: 'net_income' resolves", () => {
    const resolved = resolveConcept("net_income");
    assert(resolved.canonical === "net_income", "canonical should be 'net_income'");
    assert(resolved.tags.includes("NetIncomeLoss"), "should include 'NetIncomeLoss'");
    return { canonical: resolved.canonical, tags: resolved.tags.slice(0, 3) };
  });

  await test("get_company_facts(320193) + find revenue via alias", async () => {
    const facts = await getCompanyFacts("320193");
    assert(facts["us-gaap"] !== undefined, "should have us-gaap taxonomy");
    const gaap = facts["us-gaap"] ?? {};
    const found = findConceptData(gaap, "revenue");
    assert(found !== null, "should find revenue for Apple");
    assert(found.facts.length > 0, "should have revenue facts");
    return { tag: found.tag, unit: found.unit, rawFactCount: found.facts.length };
  });

  await test("deduplicateFacts \u2014 Apple revenue", async () => {
    const facts = await getCompanyFacts("320193");
    const gaap = facts["us-gaap"] ?? {};
    const found = findConceptData(gaap, "revenue");
    const raw = found.facts;
    const clean = deduplicateFacts(raw);
    const annuals = annualOnly(clean);
    const growth = computeGrowth(annuals);
    const trend = detectTrend(growth);
    assert(clean.length < raw.length, "deduplication should reduce fact count");
    assert(annuals.length > 0, "should have annual data points");
    assert(["growing", "declining", "flat", "volatile", "insufficient_data"].includes(trend), "trend should be a valid value");
    return { rawCount: raw.length, dedupedCount: clean.length, annualCount: annuals.length, trend };
  });

  await test("summarizeFacts \u2014 Apple top concepts", async () => {
    const facts = await getCompanyFacts("320193");
    const gaap = facts["us-gaap"] ?? {};
    const summary = summarizeFacts(gaap, 5);
    assert(summary.length > 0, "should return at least one concept");
    assert(summary.length <= 5, "should respect limit");
    assert(summary[0].count > 0, "top concept should have data points");
    return summary.map((s) => ({ concept: s.concept, latest: s.latestValue, count: s.count }));
  });

  // ── Analytics ────────────────────────────────────────────────────────────
  console.log("\nAnalytics Engine\n");

  await test("analyze_financials(320193) [Apple]", async () => {
    const analysis = await analyzeCompany("320193");
    assert(/^[A-F]$/.test(analysis.healthScore.grade), "health grade should be A-F");
    assert(analysis.healthScore.score >= 0 && analysis.healthScore.score <= 100, "score should be 0-100");
    assert(Array.isArray(analysis.healthScore.factors), "factors should be an array");
    assert(analysis.metrics.revenue !== null, "Apple should have revenue data");
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
    assert(/^[A-F]$/.test(analysis.healthScore.grade), "health grade should be A-F");
    assert(analysis.healthScore.score >= 0 && analysis.healthScore.score <= 100, "score should be 0-100");
    return {
      healthGrade: analysis.healthScore.grade,
      healthScore: analysis.healthScore.score,
      roe: analysis.ratios.returnOnEquity,
      debtToEquity: analysis.ratios.debtToEquity,
    };
  });

  await test("compare_companies([Apple vs Microsoft])", async () => {
    const comparison = await compareCompanies(["320193", "789019"]);
    assert(comparison.companies.length === 2, "should compare exactly 2 companies");
    assert(comparison.winner.byRevenue !== null, "should have a revenue winner");
    assert(comparison.winner.byHealthScore !== null, "should have a health score winner");
    return {
      companiesCompared: comparison.companies.length,
      winner: comparison.winner,
      grades: comparison.companies.map((c) => ({ cik: c.cik, grade: c.healthGrade })),
    };
  });

  // ── FRED ──────────────────────────────────────────────────────────────
  console.log("\nFRED (api.stlouisfed.org)\n");

  await test("search_economic_data('GDP')", async () => {
    const results = await searchSeries("GDP");
    assert(Array.isArray(results), "results should be an array");
    assert(results.length > 0, "should find GDP-related series");
    assert(typeof results[0].id === "string", "series should have an id");
    return { count: results.length, first: results[0].id };
  });

  await test("get_economic_data('UNRATE')", async () => {
    const data = await getObservations("UNRATE", undefined, undefined, 6);
    assert(data.series.id === "UNRATE", "series id should be UNRATE");
    assert(data.observations.length > 0, "should have observations");
    assert(typeof data.observations[0].value === "number", "observation values should be numbers");
    assert(!isNaN(data.observations[0].value), "observation values should not be NaN");
    return { count: data.observations.length, latest: data.observations[0] };
  });

  await test("get_economic_data('CPIAUCSL')", async () => {
    const data = await getObservations("CPIAUCSL", undefined, undefined, 6);
    assert(data.observations.length > 0, "should have CPI observations");
    assert(typeof data.observations[0].value === "number", "values should be numbers");
    return { count: data.observations.length };
  });

  await test("get_economic_data('FEDFUNDS')", async () => {
    const data = await getObservations("FEDFUNDS", undefined, undefined, 6);
    assert(data.observations.length > 0, "should have fed funds observations");
    return { count: data.observations.length };
  });

  await test("get_economic_data('DGS10')", async () => {
    const data = await getObservations("DGS10", undefined, undefined, 6);
    assert(data.observations.length > 0, "should have treasury yield observations");
    return { count: data.observations.length };
  });

  // ── Rate Limiter (implicit) ──────────────────────────────────────────────
  console.log("\nRate Limiter \u2014 Stress Test\n");

  await test("rapid-fire 5 SEC calls (should not 429)", async () => {
    const promises = [
      searchCompanies("Google"),
      searchCompanies("Amazon"),
      searchCompanies("Tesla"),
      searchCompanies("Meta"),
      searchCompanies("Netflix"),
    ];
    const results = await Promise.all(promises);
    const allSucceeded = results.every((r) => r.length > 0);
    assert(allSucceeded, "all 5 parallel searches should return results");
    return { queriesCompleted: results.length, allSucceeded };
  });

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(67)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`${"─".repeat(67)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
