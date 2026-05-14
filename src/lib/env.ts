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

  GOOGLE_SHEET_ID: optional('GOOGLE_SHEET_ID'),
  GOOGLE_SERVICE_ACCOUNT_BASE64: optional('GOOGLE_SERVICE_ACCOUNT_BASE64'),

  // ── AI-переводчик (Сообщения) ──
  // OpenAI API key для авто-перевода сообщений между языками собеседников.
  // Если не задан — переводы не выполняются (показывается оригинальный текст).
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),
  OPENAI_MODEL: optional('OPENAI_MODEL', 'gpt-4o-mini'),

  // ── File uploads ──
  // Локальный каталог для файлов публикаций (бизнес-план, финмодель, сертификаты).
  // На Render Free диск не персистится между деплоями — для прод нужен S3 / Spaces.
  UPLOAD_DIR: optional('UPLOAD_DIR', '/tmp/atameken-uploads'),
  UPLOAD_MAX_SIZE_MB: Number(process.env.UPLOAD_MAX_SIZE_MB ?? 10),
  // Если задан внешний public-base — собираем абсолютный URL (для CDN/S3).
  // По умолчанию — same-origin /uploads/{filename}.
  UPLOAD_PUBLIC_BASE: optional('UPLOAD_PUBLIC_BASE', ''),

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
