(() => {
  // background/background.ts
  var REQUEST_TIMEOUT_MS = 3e4;
  var PROVIDERS = {
    anthropic: {
      label: "Anthropic (Claude)",
      model: "claude-sonnet-4-20250514",
      keyPrefix: "sk-ant-",
      keyHint: "sk-ant-api03-..."
    },
    openai: {
      label: "OpenAI (GPT-4o)",
      model: "gpt-4o",
      keyPrefix: "sk-",
      keyHint: "sk-proj-..."
    },
    deepseek: {
      label: "DeepSeek",
      model: "deepseek-chat",
      keyPrefix: "sk-",
      keyHint: "sk-..."
    },
    gemini: {
      label: "Google Gemini",
      model: "gemini-2.0-flash",
      keyPrefix: "AIza",
      keyHint: "AIzaSy..."
    }
  };
  chrome.runtime.onMessage.addListener(
    (msg, _sender, sendResponse) => {
      if (msg.type !== "FILL_ASSIST") return;
      handleFillAssist(msg).then(
        sendResponse,
        (err) => sendResponse({
          error: err instanceof Error ? err.message : "Unknown error"
        })
      );
      return true;
    }
  );
  async function handleFillAssist(msg) {
    const stored = await chrome.storage.local.get(["applydProvider", "applydApiKey"]);
    const provider = stored.applydProvider ?? "anthropic";
    const apiKey = stored.applydApiKey;
    if (!apiKey) {
      return {
        error: "No API key set. Open the Applyd popup and add your API key."
      };
    }
    const prompt = buildPrompt(msg.jobDescription, msg.fields);
    let raw;
    try {
      raw = await callProvider(provider, apiKey, prompt);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Network error" };
    }
    const answers = parseAnswers(raw, msg.fields);
    return { answers };
  }
  async function callProvider(provider, apiKey, prompt) {
    switch (provider) {
      case "anthropic":
        return callAnthropic(apiKey, prompt);
      case "openai":
        return callOpenAICompat("https://api.openai.com/v1/chat/completions", PROVIDERS.openai.model, apiKey, prompt);
      case "deepseek":
        return callOpenAICompat("https://api.deepseek.com/v1/chat/completions", PROVIDERS.deepseek.model, apiKey, prompt);
      case "gemini":
        return callGemini(apiKey, prompt);
    }
  }
  async function callAnthropic(apiKey, prompt) {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: PROVIDERS.anthropic.model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }]
      })
    });
    await assertOk(res, "Anthropic");
    const data = await res.json();
    return data?.content?.[0]?.text ?? "";
  }
  async function callOpenAICompat(url, model, apiKey, prompt) {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
        // enforce JSON mode
      })
    });
    await assertOk(res, model.includes("deepseek") ? "DeepSeek" : "OpenAI");
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
  async function callGemini(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS.gemini.model}:generateContent?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          // avoids markdown fences
          maxOutputTokens: 2048
        }
      })
    });
    await assertOk(res, "Gemini");
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
  async function fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(
          `Request timed out after ${REQUEST_TIMEOUT_MS / 1e3}s. Try again.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function assertOk(res, providerName) {
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    try {
      const parsed = JSON.parse(body);
      const detail = parsed?.error?.message ?? // Anthropic / OpenAI / DeepSeek
      parsed?.error?.status ?? parsed?.message ?? `HTTP ${res.status}`;
      throw new Error(`${providerName}: ${detail}`);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`${providerName}: HTTP ${res.status}`);
      }
      throw e;
    }
  }
  function buildPrompt(jobDescription, fields) {
    const fieldManifest = fields.map((f) => {
      let line = `Field ID: "${f.id}"
Label: "${f.label}"
Type: ${f.type}
Required: ${f.required}`;
      if (f.options?.length)
        line += `
Options (pick one exactly): ${f.options.join(" | ")}`;
      if (f.placeholder) line += `
Placeholder hint: ${f.placeholder}`;
      return line;
    }).join("\n\n");
    return `You are filling out a job application form. Return ONLY a valid JSON object \u2014 no markdown fences, no explanation, no preamble.

Keys must exactly match the Field IDs provided. Values are the candidate's answers as strings.

JOB DESCRIPTION:
${jobDescription.slice(0, 3e3)}

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
  function parseAnswers(raw, fields) {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const nullMap = {};
      fields.forEach((f) => {
        nullMap[f.id] = null;
      });
      return nullMap;
    }
    const answers = {};
    fields.forEach((f) => {
      const val = parsed[f.id];
      answers[f.id] = val === null || val === void 0 ? null : String(val).trim() || null;
    });
    return answers;
  }
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      chrome.storage.local.remove(["applydApiKey", "applydProvider"]);
    }
  });
  chrome.runtime.onMessage.addListener(
    (msg, _sender, sendResponse) => {
      if (msg.type === "GET_PROVIDERS") {
        sendResponse({ providers: PROVIDERS });
      }
    }
  );
})();
