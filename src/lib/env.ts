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
};
