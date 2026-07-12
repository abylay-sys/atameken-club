import { env } from '../lib/env';

// Поддерживаемые языки (ISO-639-1). Можно расширять.
export const SUPPORTED_LANGS = ['ru', 'kk', 'en', 'zh', 'tr', 'es', 'de', 'fr', 'ar'] as const;
export type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAME: Record<Lang, string> = {
  ru: 'Russian',
  kk: 'Kazakh',
  en: 'English',
  zh: 'Chinese (Simplified)',
  tr: 'Turkish',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  ar: 'Arabic',
};

export function normalizeLang(s: string | null | undefined): Lang {
  if (!s) return 'ru';
  const lower = s.trim().toLowerCase();
  if (lower === 'kz' || lower === 'қаз' || lower === 'kazakh') return 'kk';
  if (SUPPORTED_LANGS.includes(lower as any)) return lower as Lang;
  return 'ru';
}

// ─── Выбор провайдера ────────────────────────────────────────────────────────
// 'groq' | 'gemini' | 'ollama' | 'openai' | 'off'. Пусто = авто по конфигу.
type Provider = 'ollama' | 'gemini' | 'groq' | 'openai' | 'off';
function resolveProvider(): Provider {
  const p = (env.TRANSLATE_PROVIDER || '').trim().toLowerCase();
  if (['ollama', 'gemini', 'groq', 'openai', 'off'].includes(p)) return p as Provider;
  if (env.OLLAMA_URL) return 'ollama';
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.GROQ_API_KEY) return 'groq';
  if (env.OPENAI_API_KEY) return 'openai';
  return 'off';
}
export function translationEnabled(): boolean {
  return resolveProvider() !== 'off';
}

function systemPrompt(srcLang: Lang, dstLang: Lang): string {
  return (
    `You are a professional translator for business conversations. ` +
    `Translate the user's message from ${LANG_NAME[srcLang]} into ${LANG_NAME[dstLang]}. ` +
    `Preserve names, numbers, currencies, brand names, and proper nouns. ` +
    `Keep tone professional. Return ONLY the translation, without any prefixes, quotes or explanations.`
  );
}

function cleanOutput(s: string): string {
  let t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»'))) t = t.slice(1, -1).trim();
  return t;
}
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

// ─── Единый низкоуровневый вызов провайдера ──────────────────────────────────
// Возвращает text ответа модели. json=true включает JSON-режим у провайдера.
async function rawComplete(system: string, user: string, json = false): Promise<string | null> {
  const provider = resolveProvider();
  if (provider === 'off') return null;
  if (provider === 'gemini') return geminiRaw(system, user, json);
  if (provider === 'ollama') return ollamaRaw(system, user, json);
  // groq / openai — OpenAI-совместимый API
  const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const key = provider === 'groq' ? env.GROQ_API_KEY : env.OPENAI_API_KEY;
  const model = provider === 'groq' ? env.GROQ_MODEL : env.OPENAI_MODEL;
  const body: any = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.2,
    max_tokens: Math.min(2000, Math.max(200, Math.ceil(user.length * 2.5))),
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? null;
}
async function geminiRaw(system: string, user: string, json: boolean): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const gen: any = { temperature: 0.2, maxOutputTokens: 2048 };
  if (json) gen.responseMimeType = 'application/json';
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: gen }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? null;
}
async function ollamaRaw(system: string, user: string, json: boolean): Promise<string | null> {
  const base = env.OLLAMA_URL.replace(/\/+$/, '');
  const body: any = { model: env.OLLAMA_MODEL, stream: false, options: { temperature: 0.2 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (json) body.format = 'json';
  const res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json() as { message?: { content?: string } };
  return data.message?.content ?? null;
}

/**
 * Перевод текста чата на каждый из targetLangs (по одному вызову на язык).
 * Ошибки тихо игнорируются (вызывающий покажет оригинал).
 */
export async function translateToMany(text: string, sourceLang: Lang, targetLangs: Lang[]): Promise<Record<string, string>> {
  if (resolveProvider() === 'off') return {};
  const out: Record<string, string> = {};
  await Promise.all(targetLangs.map(async (lang) => {
    if (lang === sourceLang) return;
    try {
      const r = await rawComplete(systemPrompt(sourceLang, lang), text);
      if (r) out[lang] = cleanOutput(r);
    } catch (e) {
      console.warn('[translate] chat failed', sourceLang, '→', lang, (e as Error).message);
    }
  }));
  return out;
}

/**
 * Батч-перевод набора полей (объявления) на один язык — ОДНИМ запросом (JSON-in/
 * JSON-out). При сбое парсинга — fallback на пофайловый перевод. Ключи с пустыми
 * значениями пропускаются. Возвращает { ключ: перевод } (только успешные).
 */
export async function translateFields(fields: Record<string, string>, targetLang: Lang): Promise<Record<string, string>> {
  if (resolveProvider() === 'off' || targetLang === 'ru') return {};
  const entries = Object.entries(fields).filter(([, v]) => v != null && String(v).trim().length > 0);
  if (!entries.length) return {};
  const obj = Object.fromEntries(entries);

  // Попытка 1: один JSON-запрос
  try {
    const sys =
      `You translate a JSON object of business-listing fields into ${LANG_NAME[targetLang]}. ` +
      `Translate the VALUES only; keep the KEYS exactly as given. ` +
      `Preserve numbers, currencies, units, brand names, proper nouns and Latin acronyms (FCA, CIF, NDA, ROI, KZT, USD, IT, B2B). ` +
      `Return ONLY a valid JSON object with the same keys and translated string values. No comments, no extra keys.`;
    const raw = await rawComplete(sys, JSON.stringify(obj), true);
    if (raw) {
      const parsed = JSON.parse(stripFences(raw));
      const out: Record<string, string> = {};
      for (const k of Object.keys(obj)) if (typeof parsed[k] === 'string' && parsed[k].trim()) out[k] = cleanOutput(parsed[k]);
      if (Object.keys(out).length) return out;
    }
  } catch (e) {
    console.warn('[translate] fields JSON failed, fallback per-field:', (e as Error).message);
  }

  // Попытка 2: пофайловый перевод (параллельно)
  const out: Record<string, string> = {};
  await Promise.all(entries.map(async ([k, v]) => {
    try {
      const r = await rawComplete(systemPrompt('ru', targetLang), String(v));
      if (r) out[k] = cleanOutput(r);
    } catch (_) { /* пропускаем поле */ }
  }));
  return out;
}
