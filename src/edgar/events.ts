/**
 * 8-K Corporate Event Classification.
 *
 * SEC Form 8-K filings report material corporate events between quarterly
 * reports — M&A, earnings, leadership changes, cybersecurity incidents, etc.
 * Each 8-K contains one or more "item numbers" identifying the event type.
 *
 * This module classifies those item numbers into human-readable labels with
 * significance levels so an LLM agent can prioritize market-moving events.
 */

import { getCompanyFilings } from "./client.js";

// ── 8-K Item Classification ─────────────────────────────────────────────────

export interface ItemClassification {
  item: string;
  section: string;
  label: string;
  significance: "high" | "medium" | "low";
}

const ITEM_CATEGORIES: Record<string, { section: string; label: string; significance: "high" | "medium" | "low" }> = {
  // Section 1 — Business Operations
  "1.01": { section: "Business", label: "Entry into Material Agreement", significance: "high" },
  "1.02": { section: "Business", label: "Termination of Material Agreement", significance: "high" },
  "1.03": { section: "Business", label: "Bankruptcy or Receivership", significance: "high" },
  "1.04": { section: "Business", label: "Mine Safety Violation", significance: "medium" },
  "1.05": { section: "Business", label: "Material Cybersecurity Incident", significance: "high" },

  // Section 2 — Financial Information
  "2.01": { section: "Financial", label: "Acquisition or Disposition of Assets", significance: "high" },
  "2.02": { section: "Financial", label: "Results of Operations (Earnings)", significance: "high" },
  "2.03": { section: "Financial", label: "Creation of Financial Obligation", significance: "medium" },
  "2.04": { section: "Financial", label: "Triggering Events on Financial Obligation", significance: "medium" },
  "2.05": { section: "Financial", label: "Exit or Disposal Costs", significance: "high" },
  "2.06": { section: "Financial", label: "Material Impairment", significance: "high" },

  // Section 3 — Securities
  "3.01": { section: "Securities", label: "Delisting Notice", significance: "high" },
  "3.02": { section: "Securities", label: "Unregistered Sales of Equity", significance: "medium" },
  "3.03": { section: "Securities", label: "Material Modification to Security Holder Rights", significance: "high" },

  // Section 4 — Accounting
  "4.01": { section: "Accounting", label: "Change in Auditor", significance: "high" },
  "4.02": { section: "Accounting", label: "Non-Reliance on Prior Financials", significance: "high" },

  // Section 5 — Governance
  "5.01": { section: "Governance", label: "Change in Control", significance: "high" },
  "5.02": { section: "Governance", label: "Director/Officer Departure or Appointment", significance: "high" },
  "5.03": { section: "Governance", label: "Amendments to Articles/Bylaws", significance: "medium" },
  "5.04": { section: "Governance", label: "Trading Suspension Under Benefit Plans", significance: "low" },
  "5.05": { section: "Governance", label: "Amendment to Code of Ethics", significance: "medium" },
  "5.06": { section: "Governance", label: "Change in Shell Company Status", significance: "medium" },
  "5.07": { section: "Governance", label: "Shareholder Vote Results", significance: "medium" },
  "5.08": { section: "Governance", label: "Shareholder Nominations", significance: "low" },

  // Section 7 — Regulation FD
  "7.01": { section: "Regulation FD", label: "Regulation FD Disclosure", significance: "medium" },

  // Section 8 — Other
  "8.01": { section: "Other", label: "Other Events", significance: "low" },

  // Section 9 — Exhibits
  "9.01": { section: "Exhibits", label: "Financial Statements and Exhibits", significance: "low" },
};

/**
 * Parse and classify 8-K item numbers from a comma-separated string.
 * SEC submissions return items like "2.02,9.01" for each 8-K filing.
 */
export function classifyEvent(items: string): ItemClassification[] {
  if (!items || !items.trim()) return [];

  return items
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const cat = ITEM_CATEGORIES[item];
      if (cat) {
        return { item, ...cat };
      }
      return { item, section: "Unknown", label: `Item ${item}`, significance: "low" as const };
    });
}

// ── Corporate Event Extraction ──────────────────────────────────────────────

export interface CorporateEvent {
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  items: ItemClassification[];
  highestSignificance: "high" | "medium" | "low";
}

export interface EventExtractionOptions {
  limit?: number;
  significance?: "high" | "medium" | "low";
}

/**
 * Extract and classify 8-K corporate events for a company.
 *
 * Calls getCompanyFilings(cik, "8-K") — already cached and rate-limited —
 * then classifies each filing's item numbers. Zero additional SEC API calls.
 */
export async function extractCorporateEvents(
  cik: string,
  options: EventExtractionOptions = {}
): Promise<CorporateEvent[]> {
  const { limit = 15, significance } = options;
  const cappedLimit = Math.min(Math.max(1, limit), 50);

  const submission = await getCompanyFilings(cik, "8-K");
  const filings = submission.filings;

  let events: CorporateEvent[] = filings.map((f) => {
    const classified = classifyEvent(f.items);
    const highest = classified.reduce<"high" | "medium" | "low">((max, c) => {
      if (c.significance === "high") return "high";
      if (c.significance === "medium" && max !== "high") return "medium";
      return max;
    }, "low");

    return {
      filingDate: f.filingDate,
      reportDate: f.reportDate,
      accessionNumber: f.accessionNumber,
      primaryDocument: f.primaryDocument,
      items: classified,
      highestSignificance: highest,
    };
  });

  if (significance) {
    const levels: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const threshold = levels[significance] ?? 1;
    events = events.filter((e) => (levels[e.highestSignificance] ?? 0) >= threshold);
  }

  return events.slice(0, cappedLimit);
}
