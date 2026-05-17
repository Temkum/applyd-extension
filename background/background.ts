/**
 * Background service worker.
 *
 * Owns all LLM API calls. The API key never leaves this context —
 * it is never accessible to content scripts or the host page.
 *
 * Supported providers:
 *   - anthropic  (claude-sonnet-4-20250514)
 *   - openai     (gpt-4o)
 *   - deepseek   (deepseek-chat — OpenAI-compatible wire format)
 *   - gemini     (gemini-2.0-flash)
 */

const REQUEST_TIMEOUT_MS = 30_000;

// ── Provider definitions ──────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai' | 'deepseek' | 'gemini';

interface ProviderConfig {
  label: string;
  model: string;
  keyPrefix: string;
  keyHint: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    model: 'claude-sonnet-4-20250514',
    keyPrefix: 'sk-ant-',
    keyHint: 'sk-ant-api03-...',
  },
  openai: {
    label: 'OpenAI (GPT-4o)',
    model: 'gpt-4o',
    keyPrefix: 'sk-',
    keyHint: 'sk-proj-...',
  },
  deepseek: {
    label: 'DeepSeek',
    model: 'deepseek-chat',
    keyPrefix: 'sk-',
    keyHint: 'sk-...',
  },
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-2.0-flash',
    keyPrefix: 'AIza',
    keyHint: 'AIzaSy...',
  },
};

// ── Message types ─────────────────────────────────────────────────────────────

interface ScannedFieldPayload {
  id: string;
  label: string;
  type: string;
  options?: string[];
  placeholder?: string;
  required: boolean;
}

interface FillAssistRequest {
  type: 'FILL_ASSIST';
  jobDescription: string;
  fields: ScannedFieldPayload[];
}

interface FillAssistResponse {
  answers?: Record<string, string | null>;
  error?: string;
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    msg: FillAssistRequest,
    _sender,
    sendResponse: (r: FillAssistResponse) => void,
  ) => {
    if (msg.type !== 'FILL_ASSIST') return;

    handleFillAssist(msg).then(sendResponse, (err) =>
      sendResponse({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
    );

    return true; // keep channel open for async response
  },
);

// ── Core handler ──────────────────────────────────────────────────────────────

async function handleFillAssist(
  msg: FillAssistRequest,
): Promise<FillAssistResponse> {
  const stored = await chrome.storage.local.get(['applydProvider', 'applydApiKey']);
  const provider = (stored.applydProvider ?? 'anthropic') as Provider;
  const apiKey = stored.applydApiKey as string | undefined;

  if (!apiKey) {
    return {
      error: 'No API key set. Open the Applyd popup and add your API key.',
    };
  }

  const prompt = buildPrompt(msg.jobDescription, msg.fields);

  let raw: string;
  try {
    raw = await callProvider(provider, apiKey, prompt);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }

  const answers = parseAnswers(raw, msg.fields);
  return { answers };
}

// ── Provider dispatch ─────────────────────────────────────────────────────────

async function callProvider(
  provider: Provider,
  apiKey: string,
  prompt: string,
): Promise<string> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, prompt);
    case 'openai':
      return callOpenAICompat('https://api.openai.com/v1/chat/completions', PROVIDERS.openai.model, apiKey, prompt);
    case 'deepseek':
      return callOpenAICompat('https://api.deepseek.com/v1/chat/completions', PROVIDERS.deepseek.model, apiKey, prompt);
    case 'gemini':
      return callGemini(apiKey, prompt);
  }
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: PROVIDERS.anthropic.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  await assertOk(res, 'Anthropic');
  const data = await res.json();
  return data?.content?.[0]?.text ?? '';
}

// ── OpenAI-compatible (OpenAI + DeepSeek) ────────────────────────────────────

async function callOpenAICompat(
  url: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, // enforce JSON mode
    }),
  });

  await assertOk(res, model.includes('deepseek') ? 'DeepSeek' : 'OpenAI');
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS.gemini.model}:generateContent?key=${apiKey}`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json', // avoids markdown fences
        maxOutputTokens: 2048,
      },
    }),
  });

  await assertOk(res, 'Gemini');
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Shared fetch helpers ──────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Try again.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertOk(res: Response, providerName: string): Promise<void> {
  if (res.ok) return;

  const body = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(body);
    // Each provider nests its error message differently
    const detail =
      parsed?.error?.message ??       // Anthropic / OpenAI / DeepSeek
      parsed?.error?.status ??
      parsed?.message ??
      `HTTP ${res.status}`;
    throw new Error(`${providerName}: ${detail}`);
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`${providerName}: HTTP ${res.status}`);
    }
    throw e;
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  jobDescription: string,
  fields: ScannedFieldPayload[],
): string {
  const fieldManifest = fields
    .map((f) => {
      let line = `Field ID: "${f.id}"\nLabel: "${f.label}"\nType: ${f.type}\nRequired: ${f.required}`;
      if (f.options?.length)
        line += `\nOptions (pick one exactly): ${f.options.join(' | ')}`;
      if (f.placeholder) line += `\nPlaceholder hint: ${f.placeholder}`;
      return line;
    })
    .join('\n\n');

  return `You are filling out a job application form. Return ONLY a valid JSON object — no markdown fences, no explanation, no preamble.

Keys must exactly match the Field IDs provided. Values are the candidate's answers as strings.

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

FORM FIELDS:
${fieldManifest}

RULES:
- For yes/no questions return exactly "Yes" or "No"
- For select/radio fields return one of the provided options verbatim
- For salary fields use a reasonable market rate based on the role and seniority in the job description
- For "why this company / why this role" questions write 2-3 specific sentences referencing the job description
- For demographic / EEO fields (race, gender, disability, veteran status) return "Prefer not to say" unless only specific options are provided, then pick the most neutral one
- For fields you cannot answer from the job description return null
- Never invent credentials, years of experience, or certifications not implied by the job description

Return ONLY the JSON object. Example: {"field_id_1": "answer", "field_id_2": null}`;
}

// ── Answer parser ─────────────────────────────────────────────────────────────

function parseAnswers(
  raw: string,
  fields: ScannedFieldPayload[],
): Record<string, string | null> {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Parse failure — return nulls so the sidebar shows "No answer generated"
    // rather than crashing silently
    const nullMap: Record<string, null> = {};
    fields.forEach((f) => { nullMap[f.id] = null; });
    return nullMap;
  }

  const answers: Record<string, string | null> = {};
  fields.forEach((f) => {
    const val = parsed[f.id];
    answers[f.id] =
      val === null || val === undefined ? null : String(val).trim() || null;
  });

  return answers;
}

// ── Install hook ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.remove(['applydApiKey', 'applydProvider']);
  }
});

// ── Exports for popup (provider metadata only — no keys) ──────────────────────

// Popup reads PROVIDERS via chrome.runtime.sendMessage so it never
// needs to import background.ts directly.
chrome.runtime.onMessage.addListener(
  (msg: { type: string }, _sender, sendResponse) => {
    if (msg.type === 'GET_PROVIDERS') {
      sendResponse({ providers: PROVIDERS });
    }
  },
);
