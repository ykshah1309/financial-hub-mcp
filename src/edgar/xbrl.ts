/**
 * XBRL fact deduplication and normalization.
 *
 * Raw SEC XBRL data is noisy — the same metric often appears multiple times
 * per fiscal period due to amended filings, overlapping 10-K/10-Q reports,
 * and segment-level vs consolidated contexts. This module produces one clean
 * value per fiscal period.
 */

import type { XBRLFact } from "./client.js";

export interface CleanFact {
  periodEnd: string;
  value: number;
  fiscalYear: number;
  fiscalPeriod: string;  // FY, Q1, Q2, Q3, Q4
  form: string;
  filed: string;
}

// Priority: prefer annual filings, then quarterly, then amendments
const FORM_PRIORITY: Record<string, number> = {
  "10-K": 4,
  "10-Q": 3,
  "10-K/A": 2,
  "10-Q/A": 1,
  "20-F": 4,   // foreign private issuer annual
  "6-K": 3,    // foreign private issuer interim
};

function formScore(form: string): number {
  return FORM_PRIORITY[form] ?? 0;
}

/**
 * Deduplicate raw XBRL facts into one clean value per fiscal period.
 *
 * Strategy:
 *  1. Group by (fiscalYear, fiscalPeriod) — same reporting period
 *  2. Within each group, prefer higher form priority (10-K > 10-Q > amendments)
 *  3. Break ties by latest filing date (picks up restatements)
 *  4. Return sorted chronologically
 */
export function deduplicateFacts(raw: XBRLFact[]): CleanFact[] {
  if (!raw || raw.length === 0) return [];

  // Group by fiscal period
  const groups = new Map<string, XBRLFact[]>();
  for (const fact of raw) {
    const key = `${fact.fy}-${fact.fp}`;
    const group = groups.get(key);
    if (group) {
      group.push(fact);
    } else {
      groups.set(key, [fact]);
    }
  }

  // Pick best fact from each group
  const deduped: CleanFact[] = [];
  for (const facts of groups.values()) {
    facts.sort((a, b) => {
      // Higher form priority wins
      const formDiff = formScore(b.form) - formScore(a.form);
      if (formDiff !== 0) return formDiff;
      // Latest filing date wins (restatements)
      return b.filed.localeCompare(a.filed);
    });

    const best = facts[0];
    deduped.push({
      periodEnd: best.end,
      value: best.val,
      fiscalYear: best.fy,
      fiscalPeriod: best.fp,
      form: best.form,
      filed: best.filed,
    });
  }

  // Sort chronologically
  deduped.sort((a, b) => {
    if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear - b.fiscalYear;
    return periodOrder(a.fiscalPeriod) - periodOrder(b.fiscalPeriod);
  });

  return deduped;
}

function periodOrder(fp: string): number {
  switch (fp) {
    case "Q1": return 1;
    case "Q2": return 2;
    case "Q3": return 3;
    case "Q4": return 4;
    case "FY": return 5;
    default: return 0;
  }
}

/**
 * Filter facts to annual-only (FY / Q4 from 10-K).
 * Useful for trend analysis where quarterly noise is unwanted.
 */
export function annualOnly(facts: CleanFact[]): CleanFact[] {
  return facts.filter(
    (f) => f.fiscalPeriod === "FY" || (f.fiscalPeriod === "Q4" && f.form === "10-K")
  );
}

/**
 * Compute year-over-year growth rates from a sorted array of annual facts.
 * Returns growth as a decimal (0.15 = 15% growth).
 */
export function computeGrowth(facts: CleanFact[]): Array<{ fiscalYear: number; value: number; growthRate: number | null }> {
  return facts.map((fact, i) => {
    let growthRate: number | null = null;
    if (i > 0 && facts[i - 1].value !== 0) {
      growthRate = (fact.value - facts[i - 1].value) / Math.abs(facts[i - 1].value);
    }
    return {
      fiscalYear: fact.fiscalYear,
      value: fact.value,
      growthRate,
    };
  });
}

/**
 * Determine trend direction from growth rates.
 */
export function detectTrend(growthRates: Array<{ growthRate: number | null }>): "growing" | "declining" | "flat" | "volatile" | "insufficient_data" {
  const valid = growthRates.map((g) => g.growthRate).filter((r): r is number => r !== null);
  if (valid.length < 2) return "insufficient_data";

  const recent = valid.slice(-3); // last 3 periods
  const avgGrowth = recent.reduce((s, r) => s + r, 0) / recent.length;
  const allPositive = recent.every((r) => r > 0);
  const allNegative = recent.every((r) => r < 0);

  if (allPositive && avgGrowth > 0.03) return "growing";
  if (allNegative && avgGrowth < -0.03) return "declining";
  if (Math.abs(avgGrowth) <= 0.03) return "flat";
  return "volatile";
}

/**
 * Summarize a facts array from getCompanyFacts into a compact index.
 * Returns concept name + latest value + count, not the full time series.
 */
export function summarizeFacts(
  gaapFacts: Record<string, any>,
  maxConcepts = 50
): Array<{ concept: string; label: string; latestValue: number | null; latestPeriod: string; count: number; unit: string }> {
  const entries = Object.entries(gaapFacts);
  const summaries: Array<{ concept: string; label: string; latestValue: number | null; latestPeriod: string; count: number; unit: string }> = [];

  for (const [tag, concept] of entries) {
    if (!concept?.units) continue;

    // Pick the primary unit (USD preferred)
    const unitKey = concept.units["USD"] ? "USD" : Object.keys(concept.units)[0];
    if (!unitKey) continue;

    const facts: XBRLFact[] = concept.units[unitKey];
    if (!facts || facts.length === 0) continue;

    const last = facts[facts.length - 1];
    summaries.push({
      concept: tag,
      label: concept.label ?? tag,
      latestValue: last.val,
      latestPeriod: last.end,
      count: facts.length,
      unit: unitKey,
    });
  }

  // Sort by number of data points (most reported = most important)
  summaries.sort((a, b) => b.count - a.count);
  return summaries.slice(0, maxConcepts);
}
