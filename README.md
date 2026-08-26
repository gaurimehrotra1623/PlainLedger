# PlainLedger

A company directory that presents SEC Edgar filing data in plain English. PlainLedger fetches public-company financials — revenue, net income, assets, liabilities — and translates them into concise summaries, time-series charts, and a glossary of finance terms, so readers can understand the numbers without decoding accounting jargon.

## Who It Is For

PlainLedger is built for anyone who wants to look at a public company's financial health without a finance background. Investors screening tickers, students learning financial statements, analysts doing quick comparisons, or curious readers who want the "bottom line" explained simply.

## Features

- **Company Directory** — Browse and filter hundreds of SEC-listed companies by sector.
- **Financial Snapshot** — Revenue, net income, assets, and debt rendered as animated stat cards.
- **Time-Series Charts** — Interactive SVG charts showing how key metrics changed over recent filing periods.
- **Plain English Summaries** — Auto-generated narratives explaining what the numbers mean in everyday language.
- **Jargon Glossary** — Every report includes definitions for common finance terms.
- **Risk Flags** — High-level observations about debt load, profit sustainability, and growth momentum.
- **Milo Assistant** — An AI-powered chatbot (powered by Groq) that answers follow-up questions about the currently viewed company or general finance concepts.
- **Dark / Light Theme** — Toggle between themes; preference persists across sessions.
- **Responsive Design** — Full-screen chatbot overlay on mobile; two-column dashboard on desktop.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript, JavaScript (ESM) |
| Frontend | React 18, Vite 5 |
| Styling | Custom CSS (design tokens, fluid type scale) |
| Local Server | Express 4 |
| Production | Vercel (static site + serverless functions) |
| Data Source | SEC Edgar XBRL Company Facts API |
| AI Chat | Groq API (OpenAI-compatible) |
| Math Rendering | KaTeX via remark-math / rehype-katex |

## Project Structure

```
PlainLedger/
├── api/                     # Vercel serverless functions
│   ├── chat.js              # POST /api/chat — Groq-powered assistant
│   ├── companies.js         # GET  /api/companies — full ticker index
│   ├── company/
│   │   └── [ticker].js      # GET  /api/company/:ticker — company report
│   ├── health.js            # GET  /api/health — liveness check
│   └── search.js            # GET  /api/search — filtered company search
├── lib/                     # Shared business logic (used by local server)
│   ├── chat-api.js          # Groq chat handler
│   └── sec-api.js           # SEC API fetchers, report builder
├── server/
│   └── index.js             # Express dev server (proxies /api)
├── src/
│   ├── App.tsx              # Root component — directory, detail view, chatbot
│   ├── main.tsx             # React entry point
│   └── styles.css           # All styles (tokens, components, themes, responsive)
├── index.html               # Vite HTML shell
├── vercel.json              # Vercel build config, rewrites, function settings
├── vite.config.ts           # Vite + React plugin, dev proxy
└── tsconfig.json            # TypeScript config
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- A Groq API key (for the chat feature)

### Environment Variables

Create a `.env` file in the project root:

```
GROQ_API_KEY_1=your_first_key
GROQ_API_KEY_2=your_second_key
GROQ_MODEL=openai/gpt-oss-20b
```

### Local Development

```bash
npm install
npm run dev
```

This starts the Vite dev server on `http://localhost:5175` and the Express API server on `http://localhost:3002`. The Vite dev server proxies `/api` requests to Express automatically.

### Production Build

```bash
npm run build
```

Output is written to `dist/`. To preview locally:

```bash
npm run preview
```

### Deployment

The project is configured for Vercel. Push to a connected repository or run `vercel` from the project root. The `vercel.json` configures:

- Static site output from `dist/`
- Serverless functions from `api/`
- SPA fallback rewrites (excluding `/api/*`)

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns `{ ok: true }` |
| GET | `/api/companies` | Full SEC ticker index with sector tags |
| GET | `/api/search?query=` | Filtered company search by name or ticker |
| GET | `/api/company/:ticker` | Full report: metrics, time series, plain English, risks |
| POST | `/api/chat` | AI assistant — accepts `{ message, history, pageContext }` |

This project is still under active progress. 