import express from 'express';
import cors from 'cors';
import { getTickerIndex, searchCompanies, buildCompanyReport, normalizeTicker } from '../lib/sec-api.js';
import { handleChat } from '../lib/chat-api.js';

const app = express();
const port = Number(process.env.PORT || 3002);
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
let preferredGroqKeyIndex = 0;

app.use(cors());
app.use(express.json());

app.get('/api/companies', async (req, res) => {
  try {
    const companies = await getTickerIndex();
    res.json({ companies });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load SEC company directory.' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const results = await searchCompanies(query);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to search SEC companies.' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const groqKeys = [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY].filter(Boolean);
    if (!groqKeys.length) {
      return res.status(503).json({ message: 'Chat is not configured yet. Add GROQ_API_KEY_1 and GROQ_API_KEY_2 to the server environment.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Ask a question about the company data.' });

    const history = Array.isArray(req.body?.history)
      ? req.body.history
        .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item?.content === 'string')
        .slice(-8)
        .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }))
      : [];
    const pageContext = JSON.stringify(req.body?.pageContext || { message: 'No company is currently selected.' }).slice(0, 16000);

    const requestBody = {
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: 'system', content: `You are Milo, the PlainLedger finance assistant. PlainLedger helps people understand public-company SEC filing data in simple English.
Answer finance-related questions broadly, including definitions and explanations from accounting, financial statements, corporate finance, investing, markets, banking, economics, personal finance, taxes, and financial ratios. You may explain general financial concepts even when they are not present in the opened page.
For company-specific questions, use the supplied page context and numbers whenever possible, naming the period when one is available. Never invent company values or claim data that is not in the context. Explain jargon briefly. Use dollar-sign delimiters for inline and standalone formulas so they render correctly. Prefer short headings and hyphenated bullet points; avoid pipe-delimited Markdown tables and long separator rows because this is a compact chat panel.
Stay educational: do not give personalized buy, sell, trading, tax, legal, medical, coding, or general-life advice. If a question is outside finance, say: "I can only answer questions about finance and the company data shown in PlainLedger." Keep answers concise and easy to scan.` },
        { role: 'system', content: `Current PlainLedger page context:\n${pageContext}` },
        ...history,
        { role: 'user', content: message.slice(0, 1200) },
      ],
    };

    let lastError = 'Groq request failed.';

    for (let offset = 0; offset < groqKeys.length; offset += 1) {
      const keyIndex = (preferredGroqKeyIndex + offset) % groqKeys.length;
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKeys[keyIndex]}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();

      if (response.ok) {
        preferredGroqKeyIndex = keyIndex;
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('The assistant returned an empty answer.');
        return res.json({ reply });
      }

      lastError = data?.error?.message || lastError;
      if (!/rate.?limit|quota|token/i.test(JSON.stringify(data).toLowerCase()) || offset === groqKeys.length - 1) break;
    }

    return res.status(429).json({ message: `Both Groq keys are unavailable: ${lastError}` });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to reach the PlainLedger assistant.' });
  }
});

app.get('/api/company/:ticker', async (req, res) => {
  try {
    const ticker = normalizeTicker(req.params.ticker);
    const { report } = await buildCompanyReport(ticker);
    res.json({ report });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load company report.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'PlainLedger SEC API' });
});

app.listen(port, () => {
  console.log(`SEC API running on http://localhost:${port}`);
});