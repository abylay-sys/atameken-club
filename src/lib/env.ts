import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

// ─── Прод-проверки: гарантируют, что критичные переменные настроены ───
function assertProdSafety(nodeEnv: string, corsOrigin: string[], jwtAccess: string, jwtRefresh: string) {
  if (nodeEnv !== 'production') return;
  if (corsOrigin.includes('*')) {
    throw new Error('[env] CORS_ORIGIN cannot include "*" in production. Set explicit origins.');
  }
  if (jwtAccess.length < 32 || jwtRefresh.length < 32) {
    throw new Error('[env] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be ≥32 chars in production.');
  }
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: optional('NODE_ENV', 'development'),
  CORS_ORIGIN: optional('CORS_ORIGIN', '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  DATABASE_URL: required('DATABASE_URL'),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_TTL: optional('JWT_ACCESS_TTL', '15m'),
  JWT_REFRESH_TTL: optional('JWT_REFRESH_TTL', '30d'),

  TELEGRAM_BOT_TOKEN: optional('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_MODERATOR_CHAT_ID: optional('TELEGRAM_MODERATOR_CHAT_ID'),

  // ── Email-сервис (восстановление пароля + уведомления) ──
  // Resend (free 100 emails/day). Если ключ не задан — fallback: ссылка
  // логируется в Render Logs, чтобы можно было руками передать пользователю.
  RESEND_API_KEY: optional('RESEND_API_KEY'),
  EMAIL_FROM: optional('EMAIL_FROM', 'ATAMEKEN Club <noreply@atameken.club>'),
  // Базовый URL приложения для построения ссылок в письмах (reset-password и т.д.)
  APP_BASE_URL: optional('APP_BASE_URL', 'https://atameken.club'),

  GOOGLE_SHEET_ID: optional('GOOGLE_SHEET_ID'),
  GOOGLE_SERVICE_ACCOUNT_BASE64: optional('GOOGLE_SERVICE_ACCOUNT_BASE64'),

  // ── AI-переводчик (Сообщения) ──
  // Провайдер авто-перевода чата. Пусто = авто-выбор по конфигу:
  //   OLLAMA_URL → ollama; GEMINI_API_KEY → gemini; GROQ_API_KEY → groq;
  //   OPENAI_API_KEY → openai; иначе → off (показываем оригинал).
  // Явные значения: 'ollama' | 'gemini' | 'groq' | 'openai' | 'off'.
  TRANSLATE_PROVIDER: optional('TRANSLATE_PROVIDER'),

  // ── Бесплатные хостинговые провайдеры (ключ без карты, ничего не докупать) ──
  // Groq (console.groq.com): быстро, НЕ обучается на данных. Модель по умолчанию —
  // llama-3.3-70b-versatile.
  GROQ_API_KEY: optional('GROQ_API_KEY'),
  GROQ_MODEL: optional('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  // Google Gemini (aistudio.google.com): лучший казахский. На free-tier Google
  // может использовать данные для обучения — учитывать для приватности.
  GEMINI_API_KEY: optional('GEMINI_API_KEY'),
  GEMINI_MODEL: optional('GEMINI_MODEL', 'gemini-2.0-flash'),

  // ── Локальный / self-hosted Ollama (0 за токены, но нужна своя машина) ──
  // Endpoint вида http://<host>:11434, доступный бэкенду. Модель qwen2.5:7b
  // (многоязычный, вкл. казахский); для слабого железа — qwen2.5:3b / gemma2:2b.
  OLLAMA_URL: optional('OLLAMA_URL'),
  OLLAMA_MODEL: optional('OLLAMA_MODEL', 'qwen2.5:7b'),

  // ── OpenAI (платный fallback — копейки за токены) ──
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),
  OPENAI_MODEL: optional('OPENAI_MODEL', 'gpt-4o-mini'),

  // ── File uploads (local fallback) ──
  // Локальный каталог для файлов публикаций (бизнес-план, финмодель, сертификаты).
  // ВНИМАНИЕ: на Render Free диск НЕ персистится между деплоями. Для прод обязательно
  // используем S3 (см. ниже S3_* переменные). Этот режим — только для локального dev.
  UPLOAD_DIR: optional('UPLOAD_DIR', '/tmp/atameken-uploads'),
  UPLOAD_MAX_SIZE_MB: Number(process.env.UPLOAD_MAX_SIZE_MB ?? 10),
  UPLOAD_PUBLIC_BASE: optional('UPLOAD_PUBLIC_BASE', ''),

  // ── S3-совместимое хранилище (Cloudflare R2 / DigitalOcean Spaces / AWS S3) ──
  // Если все 4 переменные ниже заданы — файлы пишутся в S3, локальный fs не используется.
  // Иначе работает fallback на локальный диск (для dev).
  // Рекомендуется Cloudflare R2: бесплатные 10GB + 0 egress = практически бесплатно.
  //
  // Пример для R2:
  //   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  //   S3_REGION=auto
  //   S3_BUCKET=atameken-uploads
  //   S3_PUBLIC_BASE=https://pub-<HASH>.r2.dev    (или свой домен через Custom Domain)
  //
  // Пример для DigitalOcean Spaces:
  //   S3_ENDPOINT=https://fra1.digitaloceanspaces.com
  //   S3_REGION=fra1
  //   S3_BUCKET=atameken-uploads
  //   S3_PUBLIC_BASE=https://atameken-uploads.fra1.cdn.digitaloceanspaces.com
  S3_ENDPOINT: optional('S3_ENDPOINT'),
  S3_REGION: optional('S3_REGION', 'auto'),
  S3_ACCESS_KEY_ID: optional('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: optional('S3_SECRET_ACCESS_KEY'),
  S3_BUCKET: optional('S3_BUCKET'),
  // Публичный URL-префикс bucket'а. Если не задан — соберём из S3_ENDPOINT + S3_BUCKET.
  S3_PUBLIC_BASE: optional('S3_PUBLIC_BASE'),
  // Префикс-папка внутри bucket'а (опционально). Например, 'uploads' → файлы пишутся как uploads/<filename>.
  S3_PREFIX: optional('S3_PREFIX', 'uploads'),

  // ── Cloudflare Turnstile (анти-бот защита на регистрации) ──
  // Site Key — публичный, фронт получает его через GET /auth/captcha-config.
  // Secret Key — серверный, используется в /register для проверки токена через siteverify.
  // По умолчанию заданы официальные test-keys Cloudflare (всегда пропускают) — dev работает
  // out-of-box. В проде ОБЯЗАТЕЛЬНО переопределить через env var (см. dash.cloudflare.com).
  // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
  TURNSTILE_SITE_KEY: optional('TURNSTILE_SITE_KEY', '1x00000000000000000000AA'),
  TURNSTILE_SECRET_KEY: optional('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA'),

  // ── Kaspi Pay ──
  // Курс USD→KZT для биллинга пакетов токенов. Можно поменять без передеплоя
  // через переменную окружения KZT_PER_USD.
  KZT_PER_USD: Number(process.env.KZT_PER_USD ?? 470),
  // Реквизиты Kaspi-магазина. Если KASPI_MERCHANT_ID не задан — работаем в
  // «mock»-режиме (создаём pending-платёж, кнопка «Я оплатил» сразу его
  // подтверждает — для dev/UAT, пока не получим реальный merchant-account).
  KASPI_MERCHANT_ID: optional('KASPI_MERCHANT_ID'),
  KASPI_API_TOKEN: optional('KASPI_API_TOKEN'),
  KASPI_PAY_BASE_URL: optional('KASPI_PAY_BASE_URL', 'https://kaspi.kz/pay'),
};

// Бросаем сразу при boot — не даём подняться с небезопасной конфигурацией в prod
assertProdSafety(env.NODE_ENV, env.CORS_ORIGIN, env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
