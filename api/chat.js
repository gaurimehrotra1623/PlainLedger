// POST /api/chat
// Shared Groq Chat logic inlined for Vercel serverless compatibility

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

const CHAT_SYSTEM_PROMPT = `You are Milo, the PlainLedger finance assistant. PlainLedger helps people understand public-company SEC filing data in simple English.
Answer finance-related questions broadly, including definitions and explanations from accounting, financial statements, corporate finance, investing, markets, banking, economics, personal finance, taxes, and financial ratios. You may explain general financial concepts even when they are not present in the opened page.
For company-specific questions, use the supplied page context and numbers whenever possible, naming the period when one is available. Never invent company values or claim data that is not in the context. Explain jargon briefly. Use dollar-sign delimiters for inline and standalone formulas so they render correctly. Prefer short headings and hyphenated bullet points; avoid pipe-delimited Markdown tables and long separator rows because this is a compact chat panel.
Stay educational: do not give personalized buy, sell, trading, tax, legal, medical, coding, or general-life advice. If a question is outside finance, say: "I can only answer questions about finance and the company data shown in PlainLedger." Keep answers concise and easy to scan.`;

function getGroqKeys() {
  const numberedKeys = [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2].filter(Boolean);
  return numberedKeys.length ? numberedKeys : [process.env.GROQ_API_KEY].filter(Boolean);
}

function shouldTryAnotherGroqKey(response, data) {
  if (response.status === 429) return true;
  const errorText = JSON.stringify(data || '').toLowerCase();
  return /rate.?limit|quota|token/.test(errorText);
}

async function handleChat(message, history, pageContext, model) {
  const groqKeys = getGroqKeys();
  if (!groqKeys.length) {
    return { error: 'Chat is not configured yet. Add GROQ_API_KEY_1 and GROQ_API_KEY_2 to the server environment.', status: 503 };
  }

  if (!message) return { error: 'Ask a question about the company data.', status: 400 };

  const requestBody = {
    model,
    temperature: 0.2,
    max_tokens: 450,
    messages: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'system', content: `Current PlainLedger page context:\n${pageContext}` },
      ...history,
      { role: 'user', content: message.slice(0, 1200) },
    ],
  };

  let lastError = 'Groq request failed.';

  for (let offset = 0; offset < groqKeys.length; offset += 1) {
    const keyIndex = offset % groqKeys.length;
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
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) throw new Error('The assistant returned an empty answer.');
      return { reply };
    }

    lastError = data?.error?.message || lastError;
    if (!shouldTryAnotherGroqKey(response, data) || offset === groqKeys.length - 1) break;
  }

  return { error: `Both Groq keys are unavailable: ${lastError}`, status: 429 };
}

// POST /api/chat
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history)
      ? req.body.history
        .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item?.content === 'string')
        .slice(-8)
        .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }))
      : [];
    const pageContext = JSON.stringify(req.body?.pageContext || { message: 'No company is currently selected.' }).slice(0, 16000);

    const result = await handleChat(message, history, pageContext, GROQ_MODEL);

    if (result.error) {
      return res.status(result.status || 500).json({ message: result.error });
    }

    res.status(200).json({ reply: result.reply });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ message: error.message || 'Unable to reach the PlainLedger assistant.' });
  }
}