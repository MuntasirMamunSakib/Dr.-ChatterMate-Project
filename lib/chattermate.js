// lib/chattermate.js
// Minimal ChatterMate SSE client. Uses built-in fetch (Node >= 18).
// We ALWAYS keep the API key server-side. The caller supplies the
// trusted report context; this module never touches the database.

const MODELS_URL = 'https://chattermate.ai/api/chat/models';
const STREAM_URL = 'https://chattermate.ai/api/chat/stream';

let cachedModelId = null;
let cachedAt = 0;

async function getDefaultModelId(apiKey) {
  const fresh = Date.now() - cachedAt < 10 * 60 * 1000;
  if (cachedModelId && fresh) return cachedModelId;
  const res = await fetch(MODELS_URL, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`ChatterMate /models returned HTTP ${res.status}`);
  const body = await res.json();
  // Defensive: try several shapes.
  const id =
    body?.default_model_id ||
    body?.default?.id ||
    body?.data?.default_model_id ||
    body?.models?.find?.(m => m?.is_default)?.id ||
    body?.models?.[0]?.id ||
    body?.data?.[0]?.id;
  if (!id) throw new Error('ChatterMate /models response did not include a model id.');
  cachedModelId = id;
  cachedAt = Date.now();
  return cachedModelId;
}

// Parse an SSE stream and accumulate `model_chunk` payload content.
async function streamChat({ apiKey, systemPrompt, prompt }) {
  const modelId = await getDefaultModelId(apiKey);
  const res = await fetch(STREAM_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      models: [modelId],
      system_prompt: systemPrompt,
      prompt
    })
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`ChatterMate /stream HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let sepIndex;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const lines = rawEvent.split('\n');
      let eventName = 'message';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      const dataStr = dataLines.join('\n');
      if (eventName === 'model_chunk') {
        try {
          const parsed = JSON.parse(dataStr);
          const piece =
            parsed?.content ?? parsed?.delta ?? parsed?.text ??
            parsed?.data?.content ?? '';
          if (typeof piece === 'string') answer += piece;
        } catch {
          answer += dataStr;
        }
      } else if (eventName === 'error') {
        throw new Error(`ChatterMate stream error: ${dataStr.slice(0, 300)}`);
      }
    }
  }
  if (!answer.trim()) throw new Error('ChatterMate returned an empty response.');
  return answer;
}

module.exports = { streamChat };