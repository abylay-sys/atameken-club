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
  // Простые синонимы и автоназвания
  if (lower === 'kz' || lower === 'қаз' || lower === 'kazakh') return 'kk';
  if (SUPPORTED_LANGS.includes(lower as any)) return lower as Lang;
  return 'ru';
}

// ─── Выбор провайдера перевода ───────────────────────────────────────────────
// Бесплатные варианты (ничего не докупать):
//   'groq'   — Groq free-tier (console.groq.com), быстро, НЕ обучается на данных
//   'gemini' — Google AI Studio free-tier (aistudio.google.com), лучший казахский
//   'ollama' — локальный/self-hosted (0 за токены, но нужна своя машина)
// Платный fallback:
//   'openai' — OpenAI API (копейки за токены)
//   'off'    — перевод отключён (показываем оригинал всем)
//
// Если TRANSLATE_PROVIDER не задан — авто по конфигу:
//   OLLAMA_URL → ollama;  GEMINI_API_KEY → gemini;  GROQ_API_KEY → groq;
//   OPENAI_API_KEY → openai;  иначе → off.
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

// Единый системный промпт переводчика для всех провайдеров.
function systemPrompt(srcLang: Lang, dstLang: Lang): string {
  return (
    `You are a professional translator for business conversations. ` +
    `Translate the user's message from ${LANG_NAME[srcLang]} into ${LANG_NAME[dstLang]}. ` +
    `Preserve names, numbers, currencies, brand names, and proper nouns. ` +
    `Keep tone professional. Return ONLY the translation, without any prefixes, quotes or explanations.`
  );
}

/**
 * Переводит текст с sourceLang на каждый язык из targetLangs параллельно.
 * Возвращает {targetLang: translatedText}. Языки, равные sourceLang, пропускаем.
 * Любая ошибка провайдера → тихо игнорируется (фронт покажет оригинал).
 */
export async function translateToMany(
  text: string,
  sourceLang: Lang,
  targetLangs: Lang[],
): Promise<Record<string, string>> {
  const provider = resolveProvider();
  if (provider === 'off') return {};
  const translate = PROVIDERS[provider];

  const out: Record<string, string> = {};
  await Promise.all(
    targetLangs.map(async (lang) => {
      if (lang === sourceLang) return;
      try {
        const r = await translate(text, sourceLang, lang);
        if (r) out[lang] = r;
      } catch (e) {
        // Тихо: пусть фронт покажет оригинал, чат не блокируем
        console.warn('[translate]', provider, 'failed', sourceLang, '→', lang, (e as Error).message);
      }
    }),
  );
  return out;
}

type TranslateFn = (text: string, src: Lang, dst: Lang) => Promise<string | null>;
const PROVIDERS: Record<Exclude<Provider, 'off'>, TranslateFn> = {
  ollama: ollamaTranslate,
  gemini: geminiTranslate,
  groq: (t, s, d) => openaiCompatTranslate('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, env.GROQ_MODEL, t, s, d),
  openai: (t, s, d) => openaiCompatTranslate('https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY, env.OPENAI_MODEL, t, s, d),
};

// Убираем частые «обёртки» моделей, если модель всё же добавила кавычки/префикс.
function cleanOutput(s: string): string {
  let t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»'))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

// ─── Groq / OpenAI (OpenAI-совместимый Chat Completions API) ─────────────────
async function openaiCompatTranslate(url: string, apiKey: string, model: string, text: string, srcLang: Lang, dstLang: Lang): Promise<string | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt(srcLang, dstLang) },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
      max_tokens: Math.min(1500, Math.max(200, Math.ceil(text.length * 2))),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const t = data.choices?.[0]?.message?.content;
  return t ? cleanOutput(t) : null;
}

// ─── Google Gemini (AI Studio free-tier) ─────────────────────────────────────
async function geminiTranslate(text: string, srcLang: Lang, dstLang: Lang): Promise<string | null> {
  const model = env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(srcLang, dstLang) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const t = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  return t ? cleanOutput(t) : null;
}

// ─── Локальный Ollama (POST {OLLAMA_URL}/api/chat) ───────────────────────────
async function ollamaTranslate(text: string, srcLang: Lang, dstLang: Lang): Promise<string | null> {
  const base = env.OLLAMA_URL.replace(/\/+$/, '');
  const res = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: env.OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.2 },
      messages: [
        { role: 'system', content: systemPrompt(srcLang, dstLang) },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { message?: { content?: string } };
  const t = data.message?.content;
  return t ? cleanOutput(t) : null;
}
