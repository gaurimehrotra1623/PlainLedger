// GET /api/company/[ticker]
// Shared SEC API logic inlined for Vercel serverless compatibility

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_FACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts/CIK';

const COMPANY_ALIASES = {
  apple: 'AAPL', aapl: 'AAPL',
  microsoft: 'MSFT', msft: 'MSFT',
  google: 'GOOGL', alphabet: 'GOOGL',
  amazon: 'AMZN', amzn: 'AMZN',
  meta: 'META', facebook: 'META',
  nvidia: 'NVDA', nvda: 'NVDA',
  tesla: 'TSLA', tsla: 'TSLA',
  netflix: 'NFLX', nflx: 'NFLX',
  samsung: 'SAMSUNG', samung: 'SAMSUNG',
  intel: 'INTC', intc: 'INTC',
};

const SECTOR_KEYWORDS = {
  Technology: ['technology', 'software', 'semiconductor', 'cloud', 'internet', 'computer', 'electronics', 'ai', 'data', 'platform', 'digital', 'telecom', 'mobile', 'network'],
  Healthcare: ['healthcare', 'pharma', 'biotech', 'medical', 'hospital', 'drug', 'device', 'diagnostic', 'health'],
  Financials: ['bank', 'finance', 'financial', 'capital', 'asset management', 'insurance', 'holding', 'trust', 'credit'],
  Consumer: ['retail', 'consumer', 'fashion', 'apparel', 'home', 'restaurant', 'food', 'beverage', 'luxury'],
  Industrials: ['industrial', 'manufacturing', 'aerospace', 'engineering', 'machinery', 'automotive', 'truck', 'logistics', 'equipment'],
  Energy: ['energy', 'oil', 'gas', 'petroleum', 'exploration', 'renewable', 'power'],
  Utilities: ['utility', 'electric', 'water', 'gas utility', 'power company', 'energy services'],
  RealEstate: ['real estate', 'reit', 'property', 'hotel', 'residential', 'mortgage', 'developers'],
  Communication: ['media', 'broadcast', 'communications', 'entertainment', 'social', 'advertising', 'internet media'],
  Materials: ['materials', 'chemicals', 'mining', 'metals', 'paper', 'fertilizer', 'forest'],
};

let tickerIndexCache = null;
let tickerIndexRequest = null;
const companyFactsCache = new Map();

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatCompactDollars(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveSector(companyName) {
  const normalized = normalizeText(companyName);
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return sector;
    }
  }
  return 'Diversified';
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PlainLedger test test@example.com',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SEC request failed with status ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getTickerIndex() {
  if (tickerIndexCache) return tickerIndexCache;
  if (!tickerIndexRequest) {
    tickerIndexRequest = fetchJson(SEC_TICKERS_URL)
      .then((data) => {
        tickerIndexCache = Object.values(data || {})
          .filter((item) => item && item.ticker && item.title)
          .map((item) => ({
            cik: String(item.cik_str ?? '').padStart(10, '0'),
            ticker: normalizeTicker(item.ticker),
            title: String(item.title || '').trim(),
            sector: deriveSector(String(item.title || '')),
          }));
        return tickerIndexCache;
      })
      .finally(() => {
        tickerIndexRequest = null;
      });
  }
  return tickerIndexRequest;
}

async function getCompanyFacts(cik) {
  if (companyFactsCache.has(cik)) return companyFactsCache.get(cik);
  const request = fetchJson(`${SEC_FACTS_URL}${cik}.json`);
  companyFactsCache.set(cik, request);
  try {
    return await request;
  } catch (error) {
    companyFactsCache.delete(cik);
    throw error;
  }
}

function readLatestFact(facts, key) {
  const fact = facts?.[key];
  const units = fact?.units?.USD;
  if (!Array.isArray(units) || units.length === 0) return null;
  const latest = [...units].sort((a, b) => new Date(b.end || b.filed || 0) - new Date(a.end || a.filed || 0))[0];
  return safeNumber(latest?.val ?? null);
}

function readSeriesFact(facts, key) {
  const fact = facts?.[key];
  const units = fact?.units?.USD || [];
  return [...units]
    .map((point) => ({
      date: point.end || point.filed || 'N/A',
      value: safeNumber(point.val) ?? 0,
    }))
    .filter((point) => point.date !== 'N/A' && point.value !== 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-10);
}

function buildPlainEnglish(companyName, metrics) {
  const revenue = metrics.revenue ?? 0;
  const netIncome = metrics.netIncome ?? 0;
  const assets = metrics.assets ?? 0;
  const liabilities = metrics.liabilities ?? 0;
  const margin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
  const debtLoad = assets > 0 ? (liabilities / assets) * 100 : 0;
  return [
    `${companyName} made about ${formatCompactDollars(revenue)} in revenue, which is the money it brought in before paying most of its costs.`,
    `After expenses, it kept about ${formatCompactDollars(netIncome)} in profit, which means its profit margin is roughly ${margin.toFixed(1)}%.`,
    `It has ${formatCompactDollars(assets)} in assets and ${formatCompactDollars(liabilities)} in liabilities, so the company is carrying a debt load of roughly ${debtLoad.toFixed(1)}% of its assets.`,
    `In plain English: the business looks healthier when sales are growing and the company keeps a solid chunk of that money as profit without taking on too much debt.`,
  ];
}

function buildJargon() {
  return [
    { term: 'Revenue', meaning: 'The total money the company earns from selling its products or services.' },
    { term: 'Net income', meaning: 'Profit after all expenses, taxes, and costs are paid.' },
    { term: 'Assets', meaning: 'Everything the company owns that has value, like cash, buildings, and equipment.' },
    { term: 'Liabilities', meaning: 'Money the company owes to others, like loans or unpaid bills.' },
    { term: 'Margin', meaning: 'How much money is left after costs. A higher margin usually means better efficiency.' },
  ];
}

async function searchCompanies(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed || trimmed.length < 2) return [];
  const lowerQuery = normalizeText(trimmed);
  const tickers = await getTickerIndex();
  const aliasKey = Object.keys(COMPANY_ALIASES).find((key) => normalizeText(key) === lowerQuery || normalizeText(key).includes(lowerQuery) || lowerQuery.includes(normalizeText(key)));
  if (aliasKey) {
    const aliasTicker = COMPANY_ALIASES[aliasKey];
    const exactMatch = tickers.find((company) => normalizeTicker(company.ticker) === normalizeTicker(aliasTicker));
    if (exactMatch) {
      return [{ cik: exactMatch.cik, ticker: exactMatch.ticker, title: exactMatch.title, sector: exactMatch.sector }];
    }
    return [{
      cik: '',
      ticker: normalizeTicker(aliasTicker),
      title: aliasKey === 'samsung' || aliasKey === 'samung' ? 'Samsung Electronics Co., Ltd.' : aliasTicker,
      sector: 'Diversified',
    }];
  }
  const results = tickers.filter((company) => {
    const ticker = normalizeText(company.ticker);
    const title = normalizeText(company.title);
    return ticker.includes(lowerQuery) || title.includes(lowerQuery);
  });
  return results
    .slice(0, 12)
    .map((company) => ({
      cik: company.cik,
      ticker: company.ticker,
      title: company.title,
      sector: company.sector,
    }));
}

async function buildCompanyReport(ticker) {
  const normalizedTicker = normalizeTicker(ticker);
  const tickers = await getTickerIndex();
  const company = tickers.find((item) => item.ticker === normalizedTicker);

  if (!company) {
    const aliasName = Object.entries(COMPANY_ALIASES).find(([, value]) => normalizeTicker(value) === normalizedTicker)?.[0] || 'This company';
    const readableName = aliasName === 'apple' ? 'Apple Inc.' : aliasName === 'microsoft' ? 'Microsoft Corp.' : aliasName === 'samsung' || aliasName === 'samung' ? 'Samsung Electronics Co., Ltd.' : aliasName;
    return {
      report: {
        company: { name: readableName, ticker: normalizedTicker, cik: 'N/A', industry: 'Public company' },
        metrics: [
          { label: 'Revenue', value: 'N/A', detail: 'Exact filing data is not available in the U.S. SEC index for this company.' },
          { label: 'Net income', value: 'N/A', detail: 'This company may be listed outside the U.S. SEC dataset.' },
          { label: 'Assets', value: 'N/A', detail: 'The SEC filing data is not available for this ticker.' },
          { label: 'Debt', value: 'N/A', detail: 'Debt details are not available here.' },
        ],
        timeSeries: { revenue: [], netIncome: [], assets: [] },
        plainEnglish: [
          `${readableName} is not directly listed in the U.S. SEC company index, so exact filing data is limited in this tool.`,
          `That does not mean the business is weak; it just means the app is using public U.S. filings as its main source of truth.`,
          `For a quick read, focus on whether the company is growing, making profit, and spending money wisely rather than memorizing ticker symbols.`,
        ],
        jargon: buildJargon(),
        riskFlags: [
          'The company may not have a direct U.S. SEC filing here, so the report is not as detailed as a listed U.S. company.',
          'Use the company name and business model to judge performance, not only the ticker symbol.',
        ],
        finalTakeaway: `This is a simple reminder: a company does not need a ticker symbol to be a real business. The important idea is to look at how it makes money, how much it keeps, and whether it is growing safely.`,
      },
    };
  }

  const cik = company.cik;
  const factsData = await getCompanyFacts(cik);
  const facts = factsData?.facts?.['us-gaap'] || {};

  const revenue = readLatestFact(facts, 'RevenueFromContractWithCustomer') ?? readLatestFact(facts, 'Revenues') ?? 0;
  const netIncome = readLatestFact(facts, 'NetIncomeLoss') ?? 0;
  const assets = readLatestFact(facts, 'Assets') ?? 0;
  const liabilities = readLatestFact(facts, 'Liabilities') ?? 0;

  const report = {
    company: { name: company.title, ticker: normalizedTicker, cik, industry: company.sector },
    metrics: [
      { label: 'Revenue', value: formatCompactDollars(revenue), detail: 'Total sales or revenue from the latest filing' },
      { label: 'Net income', value: formatCompactDollars(netIncome), detail: 'Profit left after costs and taxes' },
      { label: 'Assets', value: formatCompactDollars(assets), detail: 'What the company owns' },
      { label: 'Debt', value: formatCompactDollars(liabilities), detail: 'What the company owes' },
    ],
    timeSeries: {
      revenue: readSeriesFact(facts, 'RevenueFromContractWithCustomer').concat(readSeriesFact(facts, 'Revenues')).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-10),
      netIncome: readSeriesFact(facts, 'NetIncomeLoss').slice(-10),
      assets: readSeriesFact(facts, 'Assets').slice(-10),
    },
    plainEnglish: buildPlainEnglish(company.title, { revenue, netIncome, assets, liabilities }),
    jargon: buildJargon(),
    riskFlags: [
      'If sales slow down, the business can lose momentum even if it looks profitable today.',
      'A high debt level can make the company more vulnerable when interest rates rise or growth slows.',
      'Strong profits are helpful, but they are only meaningful if they are sustainable over time.',
    ],
    finalTakeaway: `Overall, ${company.title} appears to be a business with real sales and earnings, but the key question is whether those numbers stay strong over time while the company keeps its borrowing under control.`,
  };

  return { report };
}

// GET /api/company/[ticker]
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const ticker = normalizeTicker(req.query.ticker);
    const { report } = await buildCompanyReport(ticker);
    res.status(200).json({ report });
  } catch (error) {
    console.error('Error fetching company report:', error);
    res.status(500).json({ message: error.message || 'Unable to load company report.' });
  }
}