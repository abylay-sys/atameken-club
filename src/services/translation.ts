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
// 'ollama' — локальный/self-hosted Ollama (0 оплаты за токены, вариант Бауыржана)
// 'openai' — OpenAI API (платно за токены, но копейки)
// 'off'    — перевод отключён (показываем оригинал всем)
// Если TRANSLATE_PROVIDER не задан — определяем автоматически по конфигу:
//   есть OLLAMA_URL → ollama;  иначе есть OPENAI_API_KEY → openai;  иначе off.
type Provider = 'ollama' | 'openai' | 'off';
function resolveProvider(): Provider {
  const p = (env.TRANSLATE_PROVIDER || '').trim().toLowerCase();
  if (p === 'ollama' || p === 'openai' || p === 'off') return p;
  if (env.OLLAMA_URL) return 'ollama';
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
  const translate = provider === 'ollama' ? ollamaTranslate : openaiTranslate;

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

// Убираем частые «обёртки» локальных моделей, если модель всё же добавила префикс.
function cleanOutput(s: string): string {
  let t = s.trim();
  // срезаем окружающие кавычки
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»'))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

// ─── Провайдер 1: локальный Ollama (POST {OLLAMA_URL}/api/chat) ───────────────
// Модель задаётся через OLLAMA_MODEL (по умолчанию qwen2.5:7b — хороший
// многоязычный вариант, включая казахский). Таймаут 20с: подвисший локальный
// сервер не должен блокировать доставку сообщения.
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

// ─── Провайдер 2: OpenAI (fallback, платно) ──────────────────────────────────
async function openaiTranslate(text: string, srcLang: Lang, dstLang: Lang): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.OPENAI_API_KEY,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
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
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const t = data.choices?.[0]?.message?.content;
  return t ? cleanOutput(t) : null;
}
