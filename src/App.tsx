import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';

function useCountUp(end: number, duration = 800, start = 0) {
  const [count, setCount] = useState(start);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else setCount(end);
    };
    requestAnimationFrame(animate);
  }, [isVisible, end, duration, start]);

  return { count, ref };
}

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

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return `${value.toFixed(0)}`;
}

function parseValue(str: string): number {
  const match = str.match(/[\d.]+/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  if (str.includes('B')) return num * 1_000_000_000;
  if (str.includes('M')) return num * 1_000_000;
  if (str.includes('K')) return num * 1_000;
  return num;
}

function StatCountUp({ value, label, type = 'currency' }: { value: string; label: string; type?: 'currency' | 'number' }) {
  const num = parseValue(value);
  const { count, ref } = useCountUp(num);
  const display = type === 'currency' ? formatCurrency(count) : formatNumber(count);
  return (
    <strong ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </strong>
  );
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function Chart({ label, points }: { label: string; points: ChartPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  // Generate smooth curve path using cubic bezier
  const smoothPath = coordinates.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = coordinates[index - 1];
    const cpX = (prev.x + point.x) / 2;
    return `C ${cpX} ${prev.y} ${cpX} ${point.y} ${point.x} ${point.y}`;
  }).join(' ');

  // Generate area path (extends smooth path down to bottom)
  const areaPath = [
    `M ${coordinates[0].x} ${chartTop + chartHeight}`,
    ...coordinates.map((point, index) => {
      if (index === 0) return `L ${point.x} ${point.y}`;
      const prev = coordinates[index - 1];
      const cpX = (prev.x + point.x) / 2;
      return `C ${cpX} ${prev.y} ${cpX} ${point.y} ${point.x} ${point.y}`;
    }),
    `L ${coordinates[coordinates.length - 1].x} ${chartTop + chartHeight}`,
    'Z'
  ].join(' ');

  const activePoint = points[activeIndex ?? points.length - 1];
  const yLabels = [max, min + range / 2, min];
  const axisIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  const pathLength = pathRef.current?.getTotalLength() ?? 0;

  // Sanitize label for SVG ID (remove spaces, special chars)
  const gradientId = `chart-gradient-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="chart">
      <div className="chart-header">
        <h4>{label}</h4>
        <div className="chart-readout">
          <span>{formatDate(activePoint.date)}</span>
          <strong>{formatCurrency(activePoint.value)}</strong>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} over time chart`}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yLabels.map((value, index) => {
          const y = chartTop + (index / (yLabels.length - 1)) * chartHeight;
          return (
            <g key={`${label}-y-${index}`}>
              <line x1={chartLeft} x2={width - chartRight} y1={y} y2={y} className="chart-gridline" />
              <text x={chartLeft - 8} y={y + 4} textAnchor="end" className="chart-axis-label">{formatCurrency(value)}</text>
            </g>
          );
        })}
        {activeIndex !== null ? (
          <g className="chart-hover-group">
            <line x1={coordinates[activeIndex].x} x2={coordinates[activeIndex].x} y1={chartTop} y2={chartTop + chartHeight} className="chart-hover-line" />
            <circle
              cx={coordinates[activeIndex].x}
              cy={coordinates[activeIndex].y}
              r={6}
              className="chart-hover-marker"
            />
            <circle
              cx={coordinates[activeIndex].x}
              cy={coordinates[activeIndex].y}
              r={10}
              className="chart-hover-ring"
            />
          </g>
        ) : null}
        <path
          ref={areaRef}
          d={areaPath}
          className="chart-area"
          style={{
            fill: `url(#${gradientId})`,
            opacity: isMounted ? 1 : 0,
            transition: 'opacity 600ms cubic-bezier(0.2, 0, 0, 1) 200ms',
          }}
        />
        <path
          ref={pathRef}
          d={smoothPath}
          className="chart-line"
          style={{
            strokeDasharray: isMounted ? pathLength : 0,
            strokeDashoffset: isMounted ? 0 : pathLength,
            transition: isMounted ? 'stroke-dashoffset 800ms cubic-bezier(0.2, 0, 0, 1)' : 'none',
          }}
        />
        {coordinates.map((point, index) => (
          <g key={`${label}-${points[index].date}`}>
            <circle cx={point.x} cy={point.y} r="13" className="chart-hit-area" onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} tabIndex={0} aria-label={`${formatDate(points[index].date)}: ${formatCurrency(points[index].value)}`} />
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
    .replace(/\\\)/g, '$')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\approx/g, '≈')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1) / ($2)');
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, output: 'htmlAndMathml' }]]}
      components={{
        span: ({ node, children, ...props }) => {
          const nodeData = node as { data?: { mathDisplay?: string } };
          if (nodeData.data?.mathDisplay === 'block') {
            return <div className="math-formula">{children}</div>;
          }
          return <span {...props}>{children}</span>;
        },
        code: ({ node, children, ...props }) => {
          const nodeData = node as { data?: { mathDisplay?: string } };
          if (nodeData.data?.mathDisplay === 'inline') {
            return <span className="math-inline">{children}</span>;
          }
          return <code {...props}>{children}</code>;
        },
      }}
    >
      {normalizeAssistantMarkdown(content)}
    </ReactMarkdown>
  );
}

function Chatbot({ report }: { report: CompanyReport | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hi! I\'m Milo. Let\'s make finance simple.' },
  ]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const suggestedPrompts = report
    ? [
        'Explain the revenue trend',
        'What does the debt level mean?',
        'Is the profit margin healthy?',
        'Key risks to watch',
      ]
    : ['How do I read this data?', 'What is net income?', 'Explain assets vs liabilities'];

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    const nextMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setShowSuggestions(false);

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
                {chatMessage.role === 'assistant' ? <AssistantMessage content={chatMessage.content} /> : chatMessage.content}
              </div>
            ))}
            {loading && (
              <div className="chat-message assistant typing-indicator" aria-label="Milo is thinking">
                <span></span><span></span><span></span>
              </div>
            )}
            {!loading && showSuggestions && messages.length === 1 && (
              <div className="chat-suggestions" role="list" aria-label="Suggested questions">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="chat-suggestion"
                    onClick={() => {
                      setInput(prompt);
                      setShowSuggestions(false);
                    }}
                    role="listitem"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
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
    <button
      type="button"
      className={`theme-toggle ${theme === 'light' ? 'theme-toggle-light' : ''}`}
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-pressed={theme === 'light'}
    >
      <span className="theme-toggle-label">Dark</span>
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">{theme === 'dark' ? '\u263E' : '\u2600'}</span>
      </span>
      <span className="theme-toggle-label">Light</span>
    </button>
  );
}

function DetailedView({ report, onBack, theme, onToggleTheme }: { report: CompanyReport; onBack: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  return (
    <div className="app-shell detail-page">
      <header className="detail-page-header">
        <div className="detail-page-toolbar">
          <button type="button" className="btn btn-secondary btn-secondary-sm" onClick={onBack} aria-label="Back to company directory">
            <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
            Back to directory
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
              <StatCountUp value={metric.value} label={metric.label} />
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
              <StatCountUp value={companies.length.toLocaleString()} label="companies" type="number" />
              <span>companies</span>
            </div>
            <div>
              <StatCountUp value={(sectors.length - 1).toString()} label="sector filters" type="number" />
              <span>sector filters</span>
            </div>
            <div>
              <StatCountUp value="500" label="large-cap style watchlist" type="number" />
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
              placeholder="Type here..."
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
            <span className="pill pill-soft">{visibleCompanies.length} results</span>
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
                  <span className="pill pill-ticker">{company.ticker}</span>
                  <span className="pill pill-sector">{company.sector}</span>
                </div>
                <strong>{company.title}</strong>
              </button>
            ))}
          </div>
        </section>

        <aside className="company-detail-panel">
          {report ? (
            <>
              <button type="button" className="btn btn-cta" onClick={openDetailedView}>
                Open detailed view
                <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>

              <div className="detail-header">
                <div>
                  <p className="eyebrow">Company overview</p>
                  <h3>{report.company.name}</h3>
                </div>
<span className="pill pill-soft">{report.company.ticker}</span>
              </div>

              <div className="stats-grid">
                {report.metrics.map((metric) => (
                  <article key={metric.label} className="stat-card">
                    <span>{metric.label}</span>
                    <StatCountUp value={metric.value} label={metric.label} />
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
