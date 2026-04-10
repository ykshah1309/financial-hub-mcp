/**
 * Curated FRED Economic Indicator Catalog.
 *
 * ~50 essential series across 9 categories — the core macro indicators that
 * hedge funds, economists, and policy analysts track. Hardcoded to avoid API
 * calls for discovery; the search_economic_data tool covers the full 800k+ database.
 */

export interface FredCatalogEntry {
  seriesId: string;
  title: string;
  category: string;
  frequency: string;
  unit: string;
  description: string;
}

export const FRED_CATALOG: FredCatalogEntry[] = [
  // ── GDP & Output ──────────────────────────────────────────────────────────
  { seriesId: "GDP", title: "Gross Domestic Product", category: "gdp", frequency: "Quarterly", unit: "Billions of $", description: "Total value of goods and services produced in the US" },
  { seriesId: "GDPC1", title: "Real GDP", category: "gdp", frequency: "Quarterly", unit: "Billions of Chained 2017 $", description: "Inflation-adjusted GDP" },
  { seriesId: "A191RL1Q225SBEA", title: "Real GDP Growth Rate", category: "gdp", frequency: "Quarterly", unit: "Percent Change", description: "Quarter-over-quarter annualized real GDP growth" },
  { seriesId: "INDPRO", title: "Industrial Production Index", category: "gdp", frequency: "Monthly", unit: "Index 2017=100", description: "Output of manufacturing, mining, and utilities sectors" },
  { seriesId: "CFNAI", title: "Chicago Fed National Activity Index", category: "gdp", frequency: "Monthly", unit: "Index", description: "Weighted average of 85 economic indicators" },

  // ── Labor Market ──────────────────────────────────────────────────────────
  { seriesId: "UNRATE", title: "Unemployment Rate", category: "labor", frequency: "Monthly", unit: "Percent", description: "Percentage of labor force that is unemployed" },
  { seriesId: "PAYEMS", title: "Total Nonfarm Payrolls", category: "labor", frequency: "Monthly", unit: "Thousands of Persons", description: "Total number of paid US workers excluding farm employees" },
  { seriesId: "ICSA", title: "Initial Jobless Claims", category: "labor", frequency: "Weekly", unit: "Number", description: "New filings for unemployment insurance" },
  { seriesId: "CIVPART", title: "Labor Force Participation Rate", category: "labor", frequency: "Monthly", unit: "Percent", description: "Percentage of working-age population in the labor force" },
  { seriesId: "AWHAETP", title: "Average Weekly Hours", category: "labor", frequency: "Monthly", unit: "Hours", description: "Average weekly hours of production and nonsupervisory employees" },
  { seriesId: "CES0500000003", title: "Average Hourly Earnings", category: "labor", frequency: "Monthly", unit: "$/Hour", description: "Average hourly earnings of all private employees" },

  // ── Inflation & Prices ────────────────────────────────────────────────────
  { seriesId: "CPIAUCSL", title: "Consumer Price Index (CPI)", category: "inflation", frequency: "Monthly", unit: "Index 1982-84=100", description: "Broad measure of consumer price inflation" },
  { seriesId: "CPILFESL", title: "Core CPI (Ex Food & Energy)", category: "inflation", frequency: "Monthly", unit: "Index 1982-84=100", description: "CPI excluding volatile food and energy prices" },
  { seriesId: "PCEPI", title: "PCE Price Index", category: "inflation", frequency: "Monthly", unit: "Index 2017=100", description: "Fed's preferred inflation measure" },
  { seriesId: "PCEPILFE", title: "Core PCE Price Index", category: "inflation", frequency: "Monthly", unit: "Index 2017=100", description: "PCE excluding food and energy — Fed's primary target" },
  { seriesId: "PPIFIS", title: "Producer Price Index", category: "inflation", frequency: "Monthly", unit: "Index", description: "Wholesale/producer-level price changes" },
  { seriesId: "T5YIE", title: "5-Year Breakeven Inflation Rate", category: "inflation", frequency: "Daily", unit: "Percent", description: "Market-implied 5-year inflation expectation" },

  // ── Interest Rates ────────────────────────────────────────────────────────
  { seriesId: "FEDFUNDS", title: "Federal Funds Rate", category: "rates", frequency: "Monthly", unit: "Percent", description: "Rate at which banks lend reserves to each other overnight" },
  { seriesId: "DFF", title: "Federal Funds Effective Rate (Daily)", category: "rates", frequency: "Daily", unit: "Percent", description: "Daily effective federal funds rate" },
  { seriesId: "DGS2", title: "2-Year Treasury Yield", category: "rates", frequency: "Daily", unit: "Percent", description: "Constant maturity 2-year Treasury yield" },
  { seriesId: "DGS5", title: "5-Year Treasury Yield", category: "rates", frequency: "Daily", unit: "Percent", description: "Constant maturity 5-year Treasury yield" },
  { seriesId: "DGS10", title: "10-Year Treasury Yield", category: "rates", frequency: "Daily", unit: "Percent", description: "Benchmark long-term interest rate" },
  { seriesId: "DGS30", title: "30-Year Treasury Yield", category: "rates", frequency: "Daily", unit: "Percent", description: "Constant maturity 30-year Treasury yield" },
  { seriesId: "T10Y2Y", title: "10Y-2Y Treasury Spread", category: "rates", frequency: "Daily", unit: "Percent", description: "Yield curve slope — inverts before recessions" },
  { seriesId: "T10YFF", title: "10Y Treasury - Fed Funds Spread", category: "rates", frequency: "Daily", unit: "Percent", description: "Measures monetary policy tightness" },
  { seriesId: "SOFR", title: "Secured Overnight Financing Rate", category: "rates", frequency: "Daily", unit: "Percent", description: "Benchmark rate for dollar-denominated derivatives and loans" },

  // ── Housing ───────────────────────────────────────────────────────────────
  { seriesId: "MORTGAGE30US", title: "30-Year Fixed Mortgage Rate", category: "housing", frequency: "Weekly", unit: "Percent", description: "Average 30-year fixed-rate mortgage rate" },
  { seriesId: "MORTGAGE15US", title: "15-Year Fixed Mortgage Rate", category: "housing", frequency: "Weekly", unit: "Percent", description: "Average 15-year fixed-rate mortgage rate" },
  { seriesId: "CSUSHPINSA", title: "Case-Shiller Home Price Index", category: "housing", frequency: "Monthly", unit: "Index Jan 2000=100", description: "National home price index" },
  { seriesId: "HOUST", title: "Housing Starts", category: "housing", frequency: "Monthly", unit: "Thousands of Units", description: "New residential construction starts" },
  { seriesId: "PERMIT", title: "Building Permits", category: "housing", frequency: "Monthly", unit: "Thousands of Units", description: "New privately-owned housing units authorized" },
  { seriesId: "EXHOSLUSM495S", title: "Existing Home Sales", category: "housing", frequency: "Monthly", unit: "Number of Units", description: "Completed transactions of existing single-family homes and condos" },

  // ── Markets ───────────────────────────────────────────────────────────────
  { seriesId: "SP500", title: "S&P 500 Index", category: "markets", frequency: "Daily", unit: "Index", description: "Broad US equity market benchmark" },
  { seriesId: "VIXCLS", title: "CBOE Volatility Index (VIX)", category: "markets", frequency: "Daily", unit: "Index", description: "Market fear gauge — implied volatility of S&P 500 options" },
  { seriesId: "DEXUSEU", title: "USD/EUR Exchange Rate", category: "markets", frequency: "Daily", unit: "USD per EUR", description: "US dollar to Euro exchange rate" },
  { seriesId: "DEXJPUS", title: "JPY/USD Exchange Rate", category: "markets", frequency: "Daily", unit: "JPY per USD", description: "Japanese yen to US dollar exchange rate" },
  { seriesId: "DCOILWTICO", title: "Crude Oil Price (WTI)", category: "markets", frequency: "Daily", unit: "$/Barrel", description: "West Texas Intermediate crude oil spot price" },
  { seriesId: "GOLDAMGBD228NLBM", title: "Gold Price", category: "markets", frequency: "Daily", unit: "$/Troy Ounce", description: "London Bullion Market gold fixing price" },

  // ── Money Supply & Fed Balance Sheet ──────────────────────────────────────
  { seriesId: "M2SL", title: "M2 Money Supply", category: "money", frequency: "Monthly", unit: "Billions of $", description: "Broad money supply including savings, small time deposits, money market funds" },
  { seriesId: "WALCL", title: "Fed Total Assets", category: "money", frequency: "Weekly", unit: "Millions of $", description: "Total assets on the Federal Reserve balance sheet" },
  { seriesId: "RRPONTSYD", title: "Overnight Reverse Repo", category: "money", frequency: "Daily", unit: "Billions of $", description: "Fed overnight reverse repurchase agreements" },

  // ── Trade ─────────────────────────────────────────────────────────────────
  { seriesId: "BOPGSTB", title: "Trade Balance", category: "trade", frequency: "Monthly", unit: "Millions of $", description: "Goods and services trade balance (exports minus imports)" },
  { seriesId: "DTWEXBGS", title: "Trade Weighted US Dollar Index", category: "trade", frequency: "Daily", unit: "Index Jan 2006=100", description: "Broad trade-weighted value of the US dollar" },

  // ── Consumer ──────────────────────────────────────────────────────────────
  { seriesId: "RSAFS", title: "Retail Sales", category: "consumer", frequency: "Monthly", unit: "Millions of $", description: "Total retail and food services sales" },
  { seriesId: "UMCSENT", title: "Consumer Sentiment (UMich)", category: "consumer", frequency: "Monthly", unit: "Index 1966:Q1=100", description: "University of Michigan consumer sentiment survey" },
  { seriesId: "PCE", title: "Personal Consumption Expenditures", category: "consumer", frequency: "Monthly", unit: "Billions of $", description: "Total consumer spending" },
  { seriesId: "PSAVERT", title: "Personal Saving Rate", category: "consumer", frequency: "Monthly", unit: "Percent", description: "Personal savings as a percentage of disposable income" },
  { seriesId: "DSPIC96", title: "Real Disposable Personal Income", category: "consumer", frequency: "Monthly", unit: "Billions of Chained 2017 $", description: "Income available after taxes, adjusted for inflation" },
  { seriesId: "TOTALSA", title: "Total Vehicle Sales", category: "consumer", frequency: "Monthly", unit: "Millions of Units", description: "Total new light vehicle sales" },
];

// ── Lookup Helpers ──────────────────────────────────────────────────────────

const CATEGORIES = [...new Set(FRED_CATALOG.map((e) => e.category))];

export function getAllCategories(): string[] {
  return CATEGORIES;
}

export function getCatalogByCategory(category: string): FredCatalogEntry[] {
  return FRED_CATALOG.filter((e) => e.category === category);
}

export function getCatalogEntry(seriesId: string): FredCatalogEntry | undefined {
  return FRED_CATALOG.find((e) => e.seriesId === seriesId);
}
