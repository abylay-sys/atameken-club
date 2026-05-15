// ─── S3-совместимый клиент для хранения файлов публикаций ───
// Работает с любым S3-API провайдером: Cloudflare R2, DigitalOcean Spaces, AWS S3,
// Backblaze B2, MinIO. Достаточно задать S3_ENDPOINT + S3_BUCKET + ключи.
//
// Если переменные не заданы — функции возвращают null/false, чтобы код мог
// fallback'нуться на локальный fs (только для dev).

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env';

/** Включён ли S3-режим (заданы bucket + ключи). */
export const s3Enabled: boolean = Boolean(
  env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY,
);

/** Лениво инициализируемый клиент S3. null если режим выключен. */
let _client: S3Client | null = null;
function getClient(): S3Client {
  if (_client) return _client;
  if (!s3Enabled) {
    throw new Error('S3 is not configured (set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)');
  }
  _client = new S3Client({
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || 'auto',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // R2 и большинство S3-совместимых провайдеров любят path-style; AWS S3 умеет
    // и virtual-hosted. Path-style — безопасный универсальный дефолт.
    forcePathStyle: true,
  });
  return _client;
}

/** Соберёт key с учётом S3_PREFIX. */
export function s3Key(filename: string): string {
  const prefix = (env.S3_PREFIX || '').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${filename}` : filename;
}

/** Публичный URL для уже загруженного key. */
export function s3PublicUrl(key: string): string {
  if (env.S3_PUBLIC_BASE) {
    return env.S3_PUBLIC_BASE.replace(/\/+$/, '') + '/' + key;
  }
  // Фолбэк: endpoint/bucket/key. Для R2 это путь к API-эндпоинту (не публичный
  // R2.dev URL), но это лучше, чем ничего. Рекомендуется задавать S3_PUBLIC_BASE.
  const ep = (env.S3_ENDPOINT || '').replace(/\/+$/, '');
  return `${ep}/${env.S3_BUCKET}/${key}`;
}

/** Загрузить буфер в S3. Бросает ошибку если не получилось. */
export async function s3PutObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  contentDisposition?: string;
}): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentDisposition: params.contentDisposition,
      // ВНИМАНИЕ: ACL не задаём — Cloudflare R2 их не поддерживает и вернёт 400.
      // Публичный доступ настраивается на уровне bucket'а в дашборде провайдера.
    }),
  );
}

/** Удалить объект по key. Тихо игнорирует ошибки (best-effort). */
export async function s3DeleteObject(key: string): Promise<void> {
  if (!s3Enabled) return;
  try {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch {
    /* best-effort: не падаем, если файл уже удалён или провайдер недоступен */
  }
}
