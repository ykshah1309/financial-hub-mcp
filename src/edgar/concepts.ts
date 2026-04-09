/**
 * XBRL concept alias normalization.
 *
 * Different companies use different us-gaap tags for the same financial metric.
 * For example, Apple uses "RevenueFromContractWithCustomerExcludingAssessedTax"
 * while others use "Revenues" or "SalesRevenueNet".
 *
 * This module maps user-friendly names to all known XBRL tag variants,
 * so callers don't need to know which tag a specific company uses.
 */

import type { GaapFacts, XBRLFact } from "./client.js";

export interface ConceptGroup {
  /** User-friendly canonical name */
  canonical: string;
  /** Human-readable label */
  label: string;
  /** All known XBRL tags for this concept, ordered by preference */
  tags: string[];
  /** Expected unit (USD, shares, pure) */
  unit: string;
}

/**
 * Core financial concept groups covering the most common analysis needs.
 * Tags are ordered by prevalence — most commonly used first.
 */
export const CONCEPT_GROUPS: ConceptGroup[] = [
  // ── Income Statement ────────────────────────────────────────────────────
  {
    canonical: "revenue",
    label: "Revenue",
    tags: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
      "SalesRevenueServicesNet",
      "InterestAndDividendIncomeOperating",
      "RegulatedAndUnregulatedOperatingRevenue",
      "ElectricUtilityRevenue",
      "HealthCareOrganizationRevenue",
      "RealEstateRevenueNet",
      "OilAndGasRevenue",
      "FinancialServicesRevenue",
      "BrokerageCommissionsRevenue",
    ],
    unit: "USD",
  },
  {
    canonical: "net_income",
    label: "Net Income",
    tags: [
      "NetIncomeLoss",
      "ProfitLoss",
      "NetIncomeLossAvailableToCommonStockholdersBasic",
      "NetIncomeLossAvailableToCommonStockholdersDiluted",
      "IncomeLossFromContinuingOperations",
      "IncomeLossFromContinuingOperationsPerBasicShare",
    ],
    unit: "USD",
  },
  {
    canonical: "gross_profit",
    label: "Gross Profit",
    tags: [
      "GrossProfit",
    ],
    unit: "USD",
  },
  {
    canonical: "operating_income",
    label: "Operating Income",
    tags: [
      "OperatingIncomeLoss",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ],
    unit: "USD",
  },
  {
    canonical: "cost_of_revenue",
    label: "Cost of Revenue",
    tags: [
      "CostOfGoodsAndServicesSold",
      "CostOfRevenue",
      "CostOfGoodsSold",
      "CostOfServices",
    ],
    unit: "USD",
  },
  {
    canonical: "ebitda",
    label: "EBITDA",
    tags: [
      "OperatingIncomeLoss",  // EBITDA often not directly reported; approximate from operating income
    ],
    unit: "USD",
  },
  {
    canonical: "eps",
    label: "Earnings Per Share (Basic)",
    tags: [
      "EarningsPerShareBasic",
      "IncomeLossFromContinuingOperationsPerBasicShare",
    ],
    unit: "USD/shares",
  },
  {
    canonical: "eps_diluted",
    label: "Earnings Per Share (Diluted)",
    tags: [
      "EarningsPerShareDiluted",
      "IncomeLossFromContinuingOperationsPerDilutedShare",
    ],
    unit: "USD/shares",
  },

  // ── Balance Sheet ───────────────────────────────────────────────────────
  {
    canonical: "total_assets",
    label: "Total Assets",
    tags: [
      "Assets",
    ],
    unit: "USD",
  },
  {
    canonical: "total_liabilities",
    label: "Total Liabilities",
    tags: [
      "Liabilities",
      "LiabilitiesCurrent",
    ],
    unit: "USD",
  },
  {
    canonical: "stockholders_equity",
    label: "Stockholders' Equity",
    tags: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    unit: "USD",
  },
  {
    canonical: "cash",
    label: "Cash and Cash Equivalents",
    tags: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsAndShortTermInvestments",
      "Cash",
    ],
    unit: "USD",
  },
  {
    canonical: "long_term_debt",
    label: "Long-Term Debt",
    tags: [
      "LongTermDebt",
      "LongTermDebtNoncurrent",
      "LongTermDebtAndCapitalLeaseObligations",
    ],
    unit: "USD",
  },
  {
    canonical: "current_assets",
    label: "Current Assets",
    tags: [
      "AssetsCurrent",
    ],
    unit: "USD",
  },
  {
    canonical: "current_liabilities",
    label: "Current Liabilities",
    tags: [
      "LiabilitiesCurrent",
    ],
    unit: "USD",
  },
  {
    canonical: "total_debt",
    label: "Total Debt",
    tags: [
      "LongTermDebt",
      "DebtCurrent",
      "ShortTermBorrowings",
    ],
    unit: "USD",
  },
  {
    canonical: "shares_outstanding",
    label: "Shares Outstanding",
    tags: [
      "CommonStockSharesOutstanding",
      "EntityCommonStockSharesOutstanding",
      "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
      "WeightedAverageNumberOfSharesOutstandingBasic",
    ],
    unit: "shares",
  },

  // ── Cash Flow ───────────────────────────────────────────────────────────
  {
    canonical: "operating_cash_flow",
    label: "Operating Cash Flow",
    tags: [
      "NetCashProvidedByUsedInOperatingActivities",
    ],
    unit: "USD",
  },
  {
    canonical: "capex",
    label: "Capital Expenditures",
    tags: [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
    ],
    unit: "USD",
  },
  {
    canonical: "free_cash_flow",
    label: "Free Cash Flow",
    // Not directly in XBRL — computed from operating_cash_flow - capex
    tags: [],
    unit: "USD",
  },
  {
    canonical: "dividends_paid",
    label: "Dividends Paid",
    tags: [
      "PaymentsOfDividends",
      "PaymentsOfDividendsCommonStock",
      "PaymentsOfOrdinaryDividends",
    ],
    unit: "USD",
  },
];

/**
 * Build lookup: user-friendly name → ConceptGroup
 */
const canonicalMap = new Map<string, ConceptGroup>();
for (const group of CONCEPT_GROUPS) {
  canonicalMap.set(group.canonical, group);
}

/**
 * Build reverse lookup: any XBRL tag → ConceptGroup
 */
const tagMap = new Map<string, ConceptGroup>();
for (const group of CONCEPT_GROUPS) {
  for (const tag of group.tags) {
    if (!tagMap.has(tag)) {
      tagMap.set(tag, group);
    }
  }
}

/**
 * Resolve a concept input to the ordered list of XBRL tags to try.
 *
 * Accepts:
 *  - Canonical name: "revenue" → tries all revenue tag variants
 *  - Direct XBRL tag: "Revenues" → returns just that tag
 *  - Case-insensitive matching on both
 */
export function resolveConcept(input: string): { tags: string[]; label: string; canonical: string } {
  // Try canonical lookup first
  const lower = input.toLowerCase().replace(/[\s_-]+/g, "_");
  const byCanonical = canonicalMap.get(lower);
  if (byCanonical) {
    return { tags: byCanonical.tags, label: byCanonical.label, canonical: byCanonical.canonical };
  }

  // Try direct tag match
  const byTag = tagMap.get(input);
  if (byTag) {
    return { tags: byTag.tags, label: byTag.label, canonical: byTag.canonical };
  }

  // Fallback: treat input as a raw XBRL tag
  return { tags: [input], label: input, canonical: input };
}

/**
 * Given a company's full facts (us-gaap section), find the first matching tag
 * from a concept group and return its data.
 */
export function findConceptData(
  gaapFacts: GaapFacts,
  conceptInput: string
): { tag: string; label: string; unit: string; facts: XBRLFact[] } | null {
  const { tags, label } = resolveConcept(conceptInput);

  let bestMatch: { tag: string; label: string; unit: string; facts: XBRLFact[] } | null = null;
  let bestLatestDate = "";

  for (const tag of tags) {
    const concept = gaapFacts[tag];
    if (!concept?.units) continue;

    const unitKey = concept.units["USD"]
      ? "USD"
      : concept.units["USD/shares"]
        ? "USD/shares"
        : concept.units["shares"]
          ? "shares"
          : concept.units["pure"]
            ? "pure"
            : Object.keys(concept.units)[0];

    if (!unitKey) continue;

    const facts = concept.units[unitKey];
    if (facts && facts.length > 0) {
      // Prefer the tag whose data is most recent — avoids returning
      // stale pre-ASC-606 tags when a newer tag covers the same metric.
      const latestDate = facts.reduce((max: string, f: XBRLFact) => {
        const d = f.end ?? f.filed ?? "";
        return d > max ? d : max;
      }, "");

      if (!bestMatch || latestDate > bestLatestDate) {
        bestMatch = { tag, label: concept.label ?? label, unit: unitKey, facts };
        bestLatestDate = latestDate;
      }
    }
  }

  return bestMatch;
}

/**
 * List all available canonical concepts with their descriptions.
 * Useful for tool descriptions and help text.
 */
export function listAvailableConcepts(): Array<{ name: string; label: string; unit: string }> {
  return CONCEPT_GROUPS.map((g) => ({
    name: g.canonical,
    label: g.label,
    unit: g.unit,
  }));
}
