import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';

type CompanyDirectoryItem = {
  cik: string;
  ticker: string;
  title: string;
  sector: string;
};

type SearchResult = CompanyDirectoryItem;

type Metric = {
  label: string;
  value: string;
  detail: string;
};

type ChartPoint = {
  date: string;
  value: number;
};

type CompanyReport = {
  company: {
    name: string;
    ticker: string;
    cik: string;
    industry?: string;
  };
  metrics: Metric[];
  timeSeries: {
    revenue: ChartPoint[];
    netIncome: ChartPoint[];
    assets: ChartPoint[];
  };
  plainEnglish: string[];
  jargon: { term: string; meaning: string }[];
  riskFlags: string[];
  finalTakeaway: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const defaultQuery = 'AAPL';

function formatValue(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function Chart({ label, points }: { label: string; points: ChartPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!points.length) {
    return (
      <div className="chart empty-chart">
        <h4>{label}</h4>
        <p>No time-series data available.</p>
      </div>
    );
  }
  const width = 460;
  const height = 220;
  const chartLeft = 54;
  const chartRight = 14;
  const chartTop = 16;
  const chartBottom = 38;
  const chartWidth = width - chartLeft - chartRight;
  const chartHeight = height - chartTop - chartBottom;
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;
  const toPoint = (point: ChartPoint, index: number) => ({
    x: chartLeft + (index / Math.max(points.length - 1, 1)) * chartWidth,
    y: chartTop + (1 - (point.value - min) / range) * chartHeight,
  });
  const coordinates = points.map(toPoint);
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const activePoint = points[activeIndex ?? points.length - 1];
  const yLabels = [max, min + range / 2, min];
  const axisIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return (
    <div className="chart">
      <div className="chart-header">
        <h4>{label}</h4>
        <div className="chart-readout">
          <span>{formatDate(activePoint.date)}</span>
          <strong>{formatValue(activePoint.value)}</strong>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} over time chart`}
        onMouseLeave={() => setActiveIndex(null)}
      >
        {yLabels.map((value, index) => {
          const y = chartTop + (index / (yLabels.length - 1)) * chartHeight;
          return (
            <g key={`${label}-y-${index}`}>
              <line x1={chartLeft} x2={width - chartRight} y1={y} y2={y} className="chart-gridline" />
              <text x={chartLeft - 8} y={y + 4} textAnchor="end" className="chart-axis-label">{formatValue(value)}</text>
            </g>
          );
        })}
        {activeIndex !== null ? <line x1={coordinates[activeIndex].x} x2={coordinates[activeIndex].x} y1={chartTop} y2={chartTop + chartHeight} className="chart-hover-line" /> : null}
        <path d={path} className="chart-line" />
        {coordinates.map((point, index) => (
          <g key={`${label}-${points[index].date}`}>
            <circle cx={point.x} cy={point.y} r="13" className="chart-hit-area" onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} tabIndex={0} aria-label={`${formatDate(points[index].date)}: ${formatValue(points[index].value)}`} />
            <circle cx={point.x} cy={point.y} r={index === activeIndex ? 5 : 3} className={`chart-point ${index === activeIndex ? 'active' : ''}`} />
            {axisIndexes.includes(index) ? <text x={point.x} y={height - 12} textAnchor="middle" className="chart-axis-label">{formatDate(points[index].date)}</text> : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function normalizeAssistantMarkdown(content: string) {
  return content
    .replace(/^\s*[-*+]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');
}

function Chatbot({ report }: { report: CompanyReport | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hi! I’m Milo. Let’s make finance simple.' },
  ]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    const nextMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: nextMessages.slice(-8), pageContext: report }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The assistant is unavailable right now.');
      setMessages((current) => [...current, { role: 'assistant', content: data.reply }]);
    } catch (chatError) {
      setMessages((current) => [...current, { role: 'assistant', content: chatError instanceof Error ? chatError.message : 'The assistant is unavailable right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`chatbot ${isOpen ? 'open' : ''}`}>
      {isOpen ? (
        <section className="chat-panel" aria-label="Milo finance assistant">
          <div className="chat-panel-header">
            <div>
              <span className="eyebrow">Milo</span>
              <strong>Make the numbers clearer</strong>
            </div>
            <button type="button" className="chat-close-button" onClick={() => setIsOpen(false)} aria-label="Close assistant">&#10005;</button>
          </div>
          <div className="chat-messages" aria-live="polite">
            {messages.map((chatMessage, index) => (
              <div key={`${chatMessage.role}-${index}`} className={`chat-message ${chatMessage.role}`}>
                {chatMessage.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeAssistantMarkdown(chatMessage.content)}</ReactMarkdown> : chatMessage.content}
              </div>
            ))}
            {loading ? <div className="chat-message assistant">Reading the page...</div> : null}
          </div>
          <form className="chat-form" onSubmit={sendMessage}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about this company..." aria-label="Ask the PlainLedger assistant" disabled={loading} />
            <button type="submit" className="chat-send-button" disabled={loading || !input.trim()} aria-label="Send question">&#8593;</button>
          </form>
        </section>
      ) : null}
      <button type="button" className="chat-toggle" onClick={() => setIsOpen((open) => !open)} aria-label={isOpen ? 'Close Milo' : 'Open Milo'} aria-expanded={isOpen}>
          <span aria-hidden="true">&#128161;</span>
      </button>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button type="button" className={`theme-toggle ${theme === 'light' ? 'light-active' : ''}`} onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-pressed={theme === 'light'}>
      <span className="theme-toggle-track" aria-hidden="true"><span className="theme-toggle-thumb">{theme === 'dark' ? '\u263E' : '\u2600'}</span></span>
      <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}

function DetailedView({ report, onBack, theme, onToggleTheme }: { report: CompanyReport; onBack: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  return (
    <div className="app-shell detail-page">
      <header className="detail-page-header">
        <div className="detail-page-toolbar">
          <button type="button" className="back-button" onClick={onBack} aria-label="Back to company directory">
            <span aria-hidden="true">&#8592;</span> Back to directory
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="detail-page-title">
          <p className="eyebrow">Detailed company view</p>
          <div className="detail-title-row">
            <h1>{report.company.name}</h1>
            <span className="soft-pill">{report.company.ticker}</span>
          </div>
          <p className="detail-meta">SEC CIK {report.company.cik} <span aria-hidden="true">&#8226;</span> {report.company.industry || 'Public company'}</p>
        </div>
      </header>

      <section className="detail-page-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Latest filing snapshot</p>
            <h2>Key financial metrics</h2>
          </div>
          <span className="source-label">Source: SEC Edgar</span>
        </div>
        <div className="detail-metrics-grid">
          {report.metrics.map((metric) => (
            <article key={metric.label} className="large-stat-card">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-page-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Financial history</p>
            <h2>How the numbers changed over time</h2>
          </div>
          <span className="source-label">Hover a point for its period</span>
        </div>
        <div className="detail-chart-grid">
          <Chart label="Revenue" points={report.timeSeries.revenue} />
          <Chart label="Net income" points={report.timeSeries.netIncome} />
          <Chart label="Assets" points={report.timeSeries.assets} />
        </div>
      </section>

      <div className="detail-content-grid">
        <section className="detail-page-section">
          <p className="eyebrow">Plain English</p>
          <h2>What this means</h2>
          <div className="story-block detail-story">
            {report.plainEnglish.map((line) => <p key={line}>{line}</p>)}
          </div>
        </section>

        <section className="detail-page-section">
          <p className="eyebrow">Risk check</p>
          <h2>Things worth watching</h2>
          <ul className="risk-list detail-risk-list">
            {report.riskFlags.map((flag) => <li key={flag}>{flag}</li>)}
          </ul>
        </section>
      </div>

      <section className="detail-page-section">
        <p className="eyebrow">Finance dictionary</p>
        <h2>Terms translated</h2>
        <div className="jargon-grid">
          {report.jargon.map((item) => (
            <div key={item.term} className="jargon-item">
              <strong>{item.term}</strong>
              <span>{item.meaning}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-page-section bottom-line-section">
        <p className="eyebrow">Bottom line</p>
        <div className="takeaway-box"><p>{report.finalTakeaway}</p></div>
      </section>
      <Chatbot report={report} />
    </div>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');
  const [companies, setCompanies] = useState<CompanyDirectoryItem[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedTicker, setSelectedTicker] = useState(defaultQuery);
  const [report, setReport] = useState<CompanyReport | null>(null);
  const [detailedView, setDetailedView] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reportCache = useRef(new Map<string, CompanyReport>());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = localStorage.getItem('plainledger-theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('plainledger-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const loadDirectory = async () => {
      const response = await fetch('/api/companies');
      const data = await response.json();
      const nextCompanies = data.companies ?? [];
      setCompanies(nextCompanies);
      setResults(nextCompanies.slice(0, 12));
      if (nextCompanies[0]) {
        setSelectedTicker(nextCompanies[0].ticker);
      }
    };

    void loadDirectory();
  }, []);

  const sectors = useMemo(() => {
    const unique = Array.from(new Set(companies.map((company) => company.sector || 'Diversified')));
    return ['All', ...unique.sort()];
  }, [companies]);

  const visibleCompanies = useMemo(() => {
    const filtered = companies.filter((company) => {
      const matchesSector = selectedSector === 'All' || company.sector === selectedSector;
      const matchesQuery = !query || `${company.title} ${company.ticker}`.toLowerCase().includes(query.toLowerCase());
      return matchesSector && matchesQuery;
    });

    return filtered.slice(0, 40);
  }, [companies, query, selectedSector]);

  const handleCompanySelect = (ticker: string) => {
    if (ticker === selectedTicker) return;
    setSelectedTicker(ticker);
    setReport(null);
  };

  useEffect(() => {
    if (!selectedTicker) return;

    const cachedReport = reportCache.current.get(selectedTicker);
    if (cachedReport) {
      setReport(cachedReport);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
  let active = true;
    const loadCompany = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/company/${encodeURIComponent(selectedTicker)}`, { signal: controller.signal });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load company data.');
        }

        reportCache.current.set(selectedTicker, data.report);
        setReport(data.report);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        if (active) setError(loadError instanceof Error ? loadError.message : 'Something went wrong.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadCompany();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedTicker]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();

    if (!query.trim()) {
      setResults(companies.slice(0, 12));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      const nextResults = data.results ?? [];
      setResults(nextResults.slice(0, 12));

      if (nextResults.length > 0) {
        setSelectedTicker(nextResults[0].ticker);
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  const openDetailedView = () => {
    if (!report) return;
    window.history.pushState({}, '', `#company-${report.company.ticker.toLowerCase()}`);
    setDetailedView(true);
  };

  const closeDetailedView = () => {
    if (window.location.hash) {
      window.history.back();
    } else {
      setDetailedView(false);
    }
  };

  useEffect(() => {
    const handlePopState = () => setDetailedView(window.location.hash.startsWith('#company-'));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (detailedView && report) {
    return <DetailedView report={report} onBack={closeDetailedView} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <div className="app-shell home-layout">
      <header className="homepage-header">
        <div>
          <p className="eyebrow">SEC Edgar directory</p>
          <h1>PlainLedger</h1>
        </div>
        <div className="homepage-header-actions">
          <p className="header-copy">A simple company directory for people who want company data without the finance jargon.</p>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <h2>Explore companies across sectors</h2>
          <p>Browse the SEC Edgar universe and compare companies with plain-English summaries, filters and time-series charts.</p>
          <div className="stat-strip">
            <div>
              <strong>{companies.length.toLocaleString()}</strong>
              <span>companies</span>
            </div>
            <div>
              <strong>{sectors.length - 1}</strong>
              <span>sector filters</span>
            </div>
            <div>
              <strong>500+</strong>
              <span>large-cap style watchlist</span>
            </div>
          </div>
        </div>

        <form className="search-box" onSubmit={handleSearch}>
          <label htmlFor="company-search">Search by company name or ticker</label>
          <div className="search-row">
            <input
              id="company-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company name or ticker..."
            />
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Find company'}
            </button>
          </div>
        </form>
      </section>

      <section className="filters-panel">
        <div className="panel-header">
          <h3>Sector filters</h3>
        </div>
        <div className="filter-row">
          {sectors.map((sector) => (
            <button
              key={sector}
              type="button"
              className={`filter-pill ${selectedSector === sector ? 'active' : ''}`}
              onClick={() => setSelectedSector(sector)}
            >
              {sector}
            </button>
          ))}
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="directory-layout">
        <section className="company-list-panel">
          <div className="panel-header">
            <h3>{selectedSector === 'All' ? 'All companies' : `${selectedSector} companies`}</h3>
            <span className="soft-pill">{visibleCompanies.length} results</span>
          </div>

          <div className="company-grid">
            {visibleCompanies.map((company) => (
              <button
                type="button"
                key={`${company.ticker}-${company.cik}`}
                className={`company-card ${selectedTicker === company.ticker ? 'selected' : ''}`}
                onClick={() => handleCompanySelect(company.ticker)}
              >
                <div className="company-topline">
                  <span className="ticker-pill">{company.ticker}</span>
                  <span className="sector-badge">{company.sector}</span>
                </div>
                <strong>{company.title}</strong>
              </button>
            ))}
          </div>
        </section>

        <aside className="company-detail-panel">
          {report ? (
            <>
              <button type="button" className="detail-view-button" onClick={openDetailedView}>
                Open detailed view <span aria-hidden="true">&#8594;</span>
              </button>

              <div className="detail-header">
                <div>
                  <p className="eyebrow">Company overview</p>
                  <h3>{report.company.name}</h3>
                </div>
                <span className="soft-pill">{report.company.ticker}</span>
              </div>

              <div className="stats-grid">
                {report.metrics.map((metric) => (
                  <article key={metric.label} className="stat-card">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.detail}</small>
                  </article>
                ))}
              </div>

              <div className="story-block">
                {report.plainEnglish.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>

              <div className="chart-grid">
                <Chart label="Revenue" points={report.timeSeries.revenue} />
                <Chart label="Net income" points={report.timeSeries.netIncome} />
                <Chart label="Assets" points={report.timeSeries.assets} />
              </div>

              <div className="detail-section">
                <h4>What the jargon means</h4>
                <div className="jargon-list">
                  {report.jargon.map((item) => (
                    <div key={item.term} className="jargon-item">
                      <strong>{item.term}</strong>
                      <span>{item.meaning}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-section">
                <h4>Bottom line</h4>
                <div className="takeaway-box">
                  <p>{report.finalTakeaway}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <h3>Select a company</h3>
              <p>Pick a company card to view its revenue, profit, assets, and time series charts.</p>
            </div>
          )}
        </aside>
      </main>
      <Chatbot report={report} />
    </div>
  );
}

export default App;
