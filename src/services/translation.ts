import { env } from '../lib/env';

// Поддерживаемые языки (ISO-636-1). Можно расширять.
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

/**
 * Переводит текст с sourceLang на каждый язык из targetLangs параллельно.
 * Возвращает {targetLang: translatedText}. На languages равные sourceLang
 * мы не вызываем модель — возвращаем оригинал.
 *
 * Если OPENAI_API_KEY не задан — возвращает пустой объект (вызывающий
 * показывает оригинальный текст всем).
 */
export async function translateToMany(
  text: string,
  sourceLang: Lang,
  targetLangs: Lang[],
): Promise<Record<string, string>> {
  if (!env.OPENAI_API_KEY) return {};
  const out: Record<string, string> = {};
  // Параллельный запрос для каждого языка (gpt-4o-mini быстрый, OK для real-time)
  await Promise.all(
    targetLangs.map(async (lang) => {
      if (lang === sourceLang) return;
      try {
        const r = await openaiTranslate(text, sourceLang, lang);
        if (r) out[lang] = r;
      } catch (e) {
        // Тихо игнорируем — пусть фронт покажет оригинал
        console.warn('[translate] failed', sourceLang, '→', lang, (e as Error).message);
      }
    }),
  );
  return out;
}

async function openaiTranslate(text: string, srcLang: Lang, dstLang: Lang): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content:
            `You are a professional translator for business conversations. ` +
            `Translate the user's message from ${LANG_NAME[srcLang]} into ${LANG_NAME[dstLang]}. ` +
            `Preserve names, numbers, currencies, brand names, and proper nouns. ` +
            `Keep tone professional. Return ONLY the translation, without any prefixes or explanations.`,
        },
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
  const t = data.choices?.[0]?.message?.content?.trim();
  return t || null;
}
