/**
 * Computed financial analytics — the layer that makes this more than an API wrapper.
 *
 * Takes raw XBRL data and produces:
 *  - Financial ratios (P/E, D/E, current ratio, margins, ROE, ROA)
 *  - Multi-year growth analysis with CAGR
 *  - Composite health scoring
 *  - Cross-company normalized comparison
 */

import { getCompanyFacts, type XBRLFact } from "./client.js";
import { deduplicateFacts, annualOnly, computeGrowth, detectTrend, type CleanFact } from "./xbrl.js";
import { findConceptData } from "./concepts.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetricSnapshot {
  value: number;
  formatted: string;
  period: string;
  fiscalYear: number;
}

export interface GrowthAnalysis {
  latestValue: string;
  oneYearGrowth: string | null;
  threeYearCAGR: string | null;
  fiveYearCAGR: string | null;
  trend: string;
}

export interface FinancialRatios {
  profitMargin: string | null;
  grossMargin: string | null;
  operatingMargin: string | null;
  returnOnEquity: string | null;
  returnOnAssets: string | null;
  debtToEquity: string | null;
  currentRatio: string | null;
  quickRatio: string | null;
  interestCoverage: string | null;
}

export interface CompanyAnalysis {
  cik: string;
  metrics: Record<string, MetricSnapshot | null>;
  ratios: FinancialRatios;
  growth: {
    revenue: GrowthAnalysis | null;
    netIncome: GrowthAnalysis | null;
    eps: GrowthAnalysis | null;
  };
  healthScore: {
    score: number;       // 0-100
    grade: string;       // A, B, C, D, F
    factors: string[];   // explanations
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function cagr(startVal: number, endVal: number, years: number): number | null {
  if (startVal <= 0 || endVal <= 0 || years <= 0) return null;
  return Math.pow(endVal / startVal, 1 / years) - 1;
}

function extractLatest(gaap: Record<string, any>, concept: string): MetricSnapshot | null {
  const found = findConceptData(gaap, concept);
  if (!found) return null;
  const deduped = deduplicateFacts(found.facts);
  const annuals = annualOnly(deduped);
  const last = annuals[annuals.length - 1] ?? deduped[deduped.length - 1];
  if (!last) return null;
  return { value: last.value, formatted: fmt(last.value), period: last.periodEnd, fiscalYear: last.fiscalYear };
}

function buildGrowthAnalysis(gaap: Record<string, any>, concept: string): GrowthAnalysis | null {
  const found = findConceptData(gaap, concept);
  if (!found) return null;

  const deduped = deduplicateFacts(found.facts);
  const annuals = annualOnly(deduped);
  if (annuals.length < 2) return null;

  const growth = computeGrowth(annuals);
  const trend = detectTrend(growth);
  const latest = annuals[annuals.length - 1];

  const oneYearGrowth = growth.length >= 2
    ? growth[growth.length - 1].growthRate
    : null;

  const threeYearStart = annuals.length >= 4 ? annuals[annuals.length - 4] : null;
  const fiveYearStart = annuals.length >= 6 ? annuals[annuals.length - 6] : null;

  return {
    latestValue: fmt(latest.value),
    oneYearGrowth: oneYearGrowth !== null ? pct(oneYearGrowth) : null,
    threeYearCAGR: threeYearStart ? (() => {
      const c = cagr(threeYearStart.value, latest.value, 3);
      return c !== null ? pct(c) : null;
    })() : null,
    fiveYearCAGR: fiveYearStart ? (() => {
      const c = cagr(fiveYearStart.value, latest.value, 5);
      return c !== null ? pct(c) : null;
    })() : null,
    trend,
  };
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

export async function analyzeCompany(cik: string): Promise<CompanyAnalysis> {
  const facts = await getCompanyFacts(cik);
  const gaap = facts["us-gaap"] ?? {};

  // Extract latest values
  const revenue = extractLatest(gaap, "revenue");
  const netIncome = extractLatest(gaap, "net_income");
  const grossProfit = extractLatest(gaap, "gross_profit");
  const operatingIncome = extractLatest(gaap, "operating_income");
  const totalAssets = extractLatest(gaap, "total_assets");
  const totalLiabilities = extractLatest(gaap, "total_liabilities");
  const equity = extractLatest(gaap, "stockholders_equity");
  const cash = extractLatest(gaap, "cash");
  const longTermDebt = extractLatest(gaap, "long_term_debt");
  const currentAssets = extractLatest(gaap, "current_assets");
  const currentLiabilities = extractLatest(gaap, "current_liabilities");
  const eps = extractLatest(gaap, "eps");
  const operatingCashFlow = extractLatest(gaap, "operating_cash_flow");
  const capex = extractLatest(gaap, "capex");

  // Ratios
  const profitMargin = revenue && netIncome && revenue.value !== 0
    ? pct(netIncome.value / revenue.value) : null;
  const grossMargin = revenue && grossProfit && revenue.value !== 0
    ? pct(grossProfit.value / revenue.value) : null;
  const operatingMargin = revenue && operatingIncome && revenue.value !== 0
    ? pct(operatingIncome.value / revenue.value) : null;
  const roe = equity && netIncome && equity.value !== 0
    ? pct(netIncome.value / equity.value) : null;
  const roa = totalAssets && netIncome && totalAssets.value !== 0
    ? pct(netIncome.value / totalAssets.value) : null;
  const debtToEquity = equity && longTermDebt && equity.value !== 0
    ? (longTermDebt.value / equity.value).toFixed(2) : null;
  const currentRatio = currentAssets && currentLiabilities && currentLiabilities.value !== 0
    ? (currentAssets.value / currentLiabilities.value).toFixed(2) : null;

  // Health score
  const { score, grade, factors } = computeHealthScore({
    profitMargin: revenue && netIncome ? netIncome.value / revenue.value : null,
    debtToEquity: equity && longTermDebt && equity.value !== 0 ? longTermDebt.value / equity.value : null,
    currentRatio: currentAssets && currentLiabilities && currentLiabilities.value !== 0 ? currentAssets.value / currentLiabilities.value : null,
    roe: equity && netIncome && equity.value !== 0 ? netIncome.value / equity.value : null,
    revenueGrowth: buildGrowthAnalysis(gaap, "revenue"),
    hasCash: !!cash,
    hasPositiveIncome: netIncome ? netIncome.value > 0 : false,
  });

  return {
    cik,
    metrics: {
      revenue, netIncome, grossProfit, operatingIncome,
      totalAssets, totalLiabilities, stockholdersEquity: equity,
      cash, longTermDebt, currentAssets, currentLiabilities,
      eps, operatingCashFlow,
      freeCashFlow: operatingCashFlow && capex
        ? { value: operatingCashFlow.value - capex.value, formatted: fmt(operatingCashFlow.value - capex.value), period: operatingCashFlow.period, fiscalYear: operatingCashFlow.fiscalYear }
        : null,
    },
    ratios: {
      profitMargin, grossMargin, operatingMargin,
      returnOnEquity: roe, returnOnAssets: roa,
      debtToEquity, currentRatio,
      quickRatio: null, interestCoverage: null,
    },
    growth: {
      revenue: buildGrowthAnalysis(gaap, "revenue"),
      netIncome: buildGrowthAnalysis(gaap, "net_income"),
      eps: buildGrowthAnalysis(gaap, "eps"),
    },
    healthScore: { score, grade, factors },
  };
}

// ── Health Score ───────────────────────────────────────────────────────────────

interface HealthInputs {
  profitMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  roe: number | null;
  revenueGrowth: GrowthAnalysis | null;
  hasCash: boolean;
  hasPositiveIncome: boolean;
}

function computeHealthScore(inputs: HealthInputs): { score: number; grade: string; factors: string[] } {
  let score = 50; // Start at neutral
  const factors: string[] = [];

  // Profitability (up to +20 / -20)
  if (inputs.profitMargin !== null) {
    if (inputs.profitMargin > 0.2) { score += 20; factors.push("Strong profit margin (>20%)"); }
    else if (inputs.profitMargin > 0.1) { score += 12; factors.push("Healthy profit margin (10-20%)"); }
    else if (inputs.profitMargin > 0) { score += 5; factors.push("Thin but positive margin"); }
    else { score -= 15; factors.push("Negative profit margin"); }
  }

  // Positive income (+10 / -15)
  if (inputs.hasPositiveIncome) { score += 10; factors.push("Profitable"); }
  else { score -= 15; factors.push("Currently unprofitable"); }

  // Leverage (up to +10 / -15)
  if (inputs.debtToEquity !== null) {
    if (inputs.debtToEquity < 0.5) { score += 10; factors.push("Low leverage (D/E < 0.5)"); }
    else if (inputs.debtToEquity < 1.5) { score += 3; factors.push("Moderate leverage"); }
    else if (inputs.debtToEquity < 3) { score -= 5; factors.push("High leverage (D/E > 1.5)"); }
    else { score -= 15; factors.push("Very high leverage (D/E > 3)"); }
  }

  // Liquidity (+5 / -10)
  if (inputs.currentRatio !== null) {
    if (inputs.currentRatio > 2) { score += 5; factors.push("Strong liquidity (CR > 2)"); }
    else if (inputs.currentRatio > 1) { score += 2; factors.push("Adequate liquidity"); }
    else { score -= 10; factors.push("Liquidity risk (CR < 1)"); }
  }

  // Revenue growth (+10 / -5)
  if (inputs.revenueGrowth) {
    if (inputs.revenueGrowth.trend === "growing") { score += 10; factors.push("Revenue growing"); }
    else if (inputs.revenueGrowth.trend === "flat") { score += 0; factors.push("Revenue flat"); }
    else if (inputs.revenueGrowth.trend === "declining") { score -= 10; factors.push("Revenue declining"); }
  }

  // ROE (+5)
  if (inputs.roe !== null && inputs.roe > 0.15) {
    score += 5; factors.push("Strong ROE (>15%)");
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  let grade: string;
  if (score >= 80) grade = "A";
  else if (score >= 65) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 35) grade = "D";
  else grade = "F";

  return { score, grade, factors };
}

// ── Cross-Company Comparison ──────────────────────────────────────────────────

export interface CompanyComparison {
  companies: Array<{
    cik: string;
    metrics: Record<string, string | null>;
    ratios: Record<string, string | null>;
    healthGrade: string;
    healthScore: number;
  }>;
  winner: {
    byRevenue: string | null;
    byProfitability: string | null;
    byGrowth: string | null;
    byHealthScore: string | null;
  };
}

export async function compareCompanies(ciks: string[]): Promise<CompanyComparison> {
  if (ciks.length === 0) {
    return { companies: [], winner: { byRevenue: null, byProfitability: null, byGrowth: null, byHealthScore: null } };
  }

  // Use allSettled to handle individual company failures gracefully
  const results = await Promise.allSettled(ciks.map((cik) => analyzeCompany(cik)));
  const analyses = results
    .filter((r): r is PromiseFulfilledResult<CompanyAnalysis> => r.status === "fulfilled")
    .map((r) => r.value);

  if (analyses.length === 0) {
    return { companies: [], winner: { byRevenue: null, byProfitability: null, byGrowth: null, byHealthScore: null } };
  }

  const companies = analyses.map((a) => ({
    cik: a.cik,
    metrics: {
      revenue: a.metrics.revenue?.formatted ?? null,
      netIncome: a.metrics.netIncome?.formatted ?? null,
      totalAssets: a.metrics.totalAssets?.formatted ?? null,
      cash: a.metrics.cash?.formatted ?? null,
      eps: a.metrics.eps?.formatted ?? null,
      freeCashFlow: a.metrics.freeCashFlow?.formatted ?? null,
    },
    ratios: {
      profitMargin: a.ratios.profitMargin,
      debtToEquity: a.ratios.debtToEquity,
      currentRatio: a.ratios.currentRatio,
      roe: a.ratios.returnOnEquity,
    },
    healthGrade: a.healthScore.grade,
    healthScore: a.healthScore.score,
  }));

  // Safe reduce with initial value — never throws on empty arrays
  const byRevenue = analyses.reduce<CompanyAnalysis | null>((best, a) =>
    !best || (a.metrics.revenue?.value ?? 0) > (best.metrics.revenue?.value ?? 0) ? a : best, null
  );
  const byProfit = analyses.reduce<CompanyAnalysis | null>((best, a) =>
    !best || (a.metrics.netIncome?.value ?? -Infinity) > (best.metrics.netIncome?.value ?? -Infinity) ? a : best, null
  );
  const byHealth = analyses.reduce<CompanyAnalysis | null>((best, a) =>
    !best || a.healthScore.score > best.healthScore.score ? a : best, null
  );

  let byGrowthCik: string | null = null;
  const growthValues = analyses
    .filter((a) => a.growth.revenue?.oneYearGrowth)
    .map((a) => ({ cik: a.cik, growth: parseFloat(a.growth.revenue!.oneYearGrowth!) }))
    .filter((g) => !isNaN(g.growth));
  if (growthValues.length > 0) {
    byGrowthCik = growthValues.reduce((best, g) => g.growth > best.growth ? g : best).cik;
  }

  return {
    companies,
    winner: {
      byRevenue: byRevenue?.cik ?? null,
      byProfitability: byProfit?.cik ?? null,
      byGrowth: byGrowthCik,
      byHealthScore: byHealth?.cik ?? null,
    },
  };
}
