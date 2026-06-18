const SYSTEM_PROMPT = `# HK Dashboard AI — Master System Prompt

## ROLE

You are HK AI, the built-in personal assistant inside HK Dashboard.
You are not a chatbot first. You are an Action AI whose primary purpose is to understand natural language and perform actions inside the dashboard.
Your personality is fast, intelligent, concise, and reliable.
Never produce unnecessary long explanations when an action can be performed.

## PRIMARY OBJECTIVE

Convert natural language into structured dashboard actions.

Supported modules: Notes, Todo List, Calendar Events.

If the request is informational, answer normally using action "chat".
If the request requires creating, updating, or deleting data, return structured output.

## AVAILABLE ACTIONS

Notes: create_note, update_note, delete_note, list_notes
Todo: create_task, update_task, complete_task, delete_task, list_tasks
Calendar: create_event, update_event, delete_event, list_events
Clarification: clarification (when confidence is below 80%)
Chat: chat (for informational questions only)

## OUTPUT RULE

For dashboard actions and clarification: return ONLY ONE JSON object. No markdown. No code block. No extra text.

For chat action: return ONE JSON object with action "chat" and the answer in "content".

## JSON SCHEMA

{
  "action": "",
  "title": "",
  "content": "",
  "description": null,
  "date": null,
  "time": null,
  "priority": null,
  "category": null,
  "status": null,
  "id": null,
  "success_message": "",
  "question": null
}

Unused fields must be null.

## INTELLIGENT UNDERSTANDING

"I need to remember..." / "Don't forget..." → create_note
"I have to..." / "Remind me..." → create_task
"On 5 August..." / "My birthday..." → create_event
"Delete my shopping note" → delete_note
"Mark Physics homework done" → complete_task

## AUTO TITLES

If user does not provide a title, generate one (Shopping List, Meeting Notes, Physics Revision, etc.).

## AUTO CATEGORIES

Shopping→Personal, Homework→Study, Exam→Exam, Coding→Programming, Stocks→Trading, Gym→Health, Office→Work

## DATE UNDERSTANDING

Understand today, tomorrow, next monday, next week, 7 july, 5pm, 8:30 am.
Convert dates to YYYY-MM-DD when possible. Convert times to HH:MM (24h).

## TASK SPLITTING

If user lists multiple tasks (e.g. "Tomorrow: Buy milk, Buy bread, Buy eggs"), put each task title on its own line in "content" for create_task.

## NOTE FORMATTING

Convert messy lists into readable newline-separated notes in "content".

## MEMORY RULE

Never invent facts. Use only the current request and provided dashboard context.

## FALLBACK

If confidence is below 80%, return:
{"action":"clarification","question":"Should I save this as a note, task, or calendar event?", ...other fields null}

## VALIDATION

Valid JSON, one action only, required fields exist, no markdown, no explanations outside JSON.`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-access-key');
}

function json(res, status, payload) {
  res.statusCode = status;
  setCors(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function errorStatus(error) {
  return Number(error?.statusCode || error?.status || 500);
}

function assertAccess(req) {
  const expected = String(process.env.DASHBOARD_ACCESS_KEY || '').trim();
  if (!expected) return;

  const actual = String(req.headers['x-dashboard-access-key'] || '').trim();
  if (actual !== expected) {
    throw createHttpError('Dashboard access key required.', 401);
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function readEnv(key) {
  return String(process.env[key] || '').trim();
}

function providerOrder() {
  const forced = readEnv('AI_PROVIDER').toLowerCase();
  if (forced && forced !== 'auto') return [forced];

  return (readEnv('AI_PROVIDER_ORDER') || 'gemini,openrouter,groq,openai')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function providerConfigs() {
  const siteUrl =
    readEnv('NEXT_PUBLIC_SITE_URL') ||
    readEnv('VITE_SITE_URL') ||
    readEnv('SITE_URL') ||
    'https://hk-dashboard-omega.vercel.app';

  return {
    gemini: () => {
      const apiKey = readEnv('GEMINI_API_KEY') || readEnv('GOOGLE_API_KEY');
      if (!apiKey) return null;
      return {
        name: 'gemini',
        type: 'gemini',
        apiKey,
        model: readEnv('GEMINI_MODEL') || 'gemini-2.0-flash'
      };
    },
    openrouter: () => {
      const apiKey = readEnv('OPENROUTER_API_KEY');
      if (!apiKey) return null;
      return {
        name: 'openrouter',
        type: 'openai-compatible',
        apiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: readEnv('OPENROUTER_MODEL') || 'google/gemini-2.0-flash-001',
        extraHeaders: {
          'HTTP-Referer': siteUrl,
          'X-Title': 'HK Dashboard'
        }
      };
    },
    groq: () => {
      const apiKey = readEnv('GROQ_API_KEY');
      if (!apiKey) return null;
      return {
        name: 'groq',
        type: 'openai-compatible',
        apiKey,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: readEnv('GROQ_MODEL') || 'llama-3.3-70b-versatile'
      };
    },
    openai: () => {
      const apiKey = readEnv('OPENAI_API_KEY') || readEnv('AI_API_KEY');
      if (!apiKey) return null;
      return {
        name: 'openai',
        type: 'openai-compatible',
        apiKey,
        baseUrl: readEnv('OPENAI_BASE_URL') || readEnv('AI_BASE_URL') || 'https://api.openai.com/v1',
        model: readEnv('OPENAI_MODEL') || readEnv('AI_MODEL') || 'gpt-4o-mini'
      };
    }
  };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildContextMessage(context) {
  if (!context || typeof context !== 'object') return 'Dashboard context: none provided.';
  return `Dashboard context (use for ids and matching only, do not invent data):
Today: ${context.today || 'unknown'}
Notes: ${JSON.stringify(context.notes || [])}
Tasks: ${JSON.stringify(context.tasks || [])}
Events: ${JSON.stringify(context.events || [])}`;
}

function buildMessages({ message, context, history = [] }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: buildContextMessage(context) }
  ];

  (Array.isArray(history) ? history : []).slice(-8).forEach((entry) => {
    if (!entry || !entry.role || !entry.text) return;
    messages.push({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: String(entry.text)
    });
  });

  messages.push({ role: 'user', content: String(message || '').trim() });
  return messages;
}

function parseAiContent(content) {
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== 'object') {
    return {
      action: 'chat',
      title: null,
      content: String(content || 'I could not parse that request.'),
      description: null,
      date: null,
      time: null,
      priority: null,
      category: null,
      status: null,
      id: null,
      success_message: null,
      question: null
    };
  }
  return parsed;
}

async function callGemini(config, messages) {
  const systemText = messages
    .filter((entry) => entry.role === 'system')
    .map((entry) => entry.content)
    .join('\n\n');

  const contents = messages
    .filter((entry) => entry.role !== 'system')
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: entry.content }]
    }));

  const url = `https://generativeai.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const body = {
    contents,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      payload?.error?.message ||
      payload?.error?.status ||
      `Gemini request failed (${response.status}).`;
    throw createHttpError(detail, response.status >= 500 ? 502 : 400);
  }

  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

async function callOpenAiCompatible(config, messages) {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    ...(config.extraHeaders || {})
  };

  const response = await fetch(`${String(config.baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      payload?.error?.message || payload?.message || `${config.name} request failed (${response.status}).`;
    throw createHttpError(detail, response.status >= 500 ? 502 : 400);
  }

  return payload?.choices?.[0]?.message?.content || '';
}

async function callAi({ message, context, history = [] }) {
  const messages = buildMessages({ message, context, history });
  const configs = providerConfigs();
  const attempts = [];
  let lastError = null;

  for (const name of providerOrder()) {
    const factory = configs[name];
    if (!factory) continue;

    const config = factory();
    if (!config) continue;

    try {
      const content =
        config.type === 'gemini'
          ? await callGemini(config, messages)
          : await callOpenAiCompatible(config, messages);

      return {
        result: parseAiContent(content),
        provider: config.name,
        model: config.model
      };
    } catch (error) {
      lastError = error;
      attempts.push(`${config.name}: ${error.message}`);
    }
  }

  if (attempts.length) {
    throw createHttpError(attempts.join(' | '), errorStatus(lastError) || 502);
  }

  throw createHttpError(
    'No AI provider configured. Add GEMINI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY on Vercel.',
    503
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Use POST.' });
    return;
  }

  try {
    assertAccess(req);
    const body = await readJson(req);
    const message = String(body.message || '').trim();
    if (!message) {
      json(res, 400, { error: 'Message is required.' });
      return;
    }

    const ai = await callAi({
      message,
      context: body.context,
      history: body.history
    });

    json(res, 200, ai);
  } catch (error) {
    json(res, errorStatus(error), { error: error.message || 'AI request failed.' });
  }
}
