import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../middleware/auth';
import { env } from '../lib/env';
import { s3Enabled, s3Key, s3PublicUrl, s3PutObject } from '../lib/s3';

// Разрешённые MIME-типы для загрузки в публикациях
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',                                                // .doc
  'text/csv',
]);

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/csv': 'csv',
};

function ensureUploadDir() {
  if (!fs.existsSync(env.UPLOAD_DIR)) {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  }
}

/** Public URL для локального fs-режима (dev). */
function localPublicUrl(filename: string): string {
  if (env.UPLOAD_PUBLIC_BASE) {
    return env.UPLOAD_PUBLIC_BASE.replace(/\/+$/, '') + '/' + filename;
  }
  return '/uploads/' + filename;
}

/** Прочитать всё содержимое multipart-stream в буфер с проверкой лимита. */
async function streamToBuffer(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        // Останавливаем чтение — кидаем ошибку с кодом fastify-style
        stream.removeAllListeners('data');
        const err: any = new Error('File too large');
        err.code = 'FST_REQ_FILE_TOO_LARGE';
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export default async function uploadsRoutes(app: FastifyInstance) {
  // Локальный fs нужен только когда S3 не настроен
  if (!s3Enabled) ensureUploadDir();

  await app.register(multipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_SIZE_MB * 1024 * 1024,
      files: 1,
    },
  });

  // ── POST /uploads/file ── multipart, auth required
  app.post('/file', { preHandler: requireAuth }, async (req, reply) => {
    const data = await (req as any).file();
    if (!data) return reply.code(400).send({ error: 'Файл не передан' });

    const mime = data.mimetype as string;
    if (!ALLOWED_MIME.has(mime)) {
      return reply.code(415).send({
        error: 'Неподдерживаемый формат',
        allowed: [...ALLOWED_MIME],
      });
    }
    const ext = EXT_BY_MIME[mime] || 'bin';
    // Префикс из user-id + random suffix чтобы не пересекались
    const userPrefix = req.user!.sub.slice(0, 8);
    const safeName = `${Date.now()}-${userPrefix}-${randomBytes(4).toString('hex')}.${ext}`;
    const maxBytes = env.UPLOAD_MAX_SIZE_MB * 1024 * 1024;

    // ── Режим 1: S3 (production) ──
    if (s3Enabled) {
      let buf: Buffer;
      try {
        buf = await streamToBuffer(data.file as NodeJS.ReadableStream, maxBytes);
      } catch (e: any) {
        if (e && e.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: `Файл больше ${env.UPLOAD_MAX_SIZE_MB} МБ` });
        }
        req.log.error({ err: e }, 'multipart read failed');
        return reply.code(500).send({ error: 'Не удалось прочитать файл' });
      }
      try {
        const key = s3Key(safeName);
        await s3PutObject({
          key,
          body: buf,
          contentType: mime,
          contentDisposition: `inline; filename="${encodeURIComponent(data.filename || safeName)}"`,
        });
        return reply.code(201).send({
          file: {
            filename: safeName,
            originalName: data.filename,
            url: s3PublicUrl(key),
            mimeType: mime,
            size: buf.length,
          },
        });
      } catch (e: any) {
        req.log.error({ err: e }, 's3 upload failed');
        return reply.code(502).send({ error: 'Не удалось загрузить файл в хранилище' });
      }
    }

    // ── Режим 2: локальный fs (dev / fallback) ──
    const fullPath = path.join(env.UPLOAD_DIR, safeName);
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(fullPath);
        data.file.pipe(ws);
        data.file.on('error', reject);
        ws.on('finish', () => resolve());
        ws.on('error', reject);
      });
    } catch (e: any) {
      if (e && e.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: `Файл больше ${env.UPLOAD_MAX_SIZE_MB} МБ` });
      }
      req.log.error({ err: e }, 'upload write failed');
      try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
      return reply.code(500).send({ error: 'Не удалось сохранить файл' });
    }

    const stat = fs.statSync(fullPath);
    return reply.code(201).send({
      file: {
        filename: safeName,
        originalName: data.filename,
        url: localPublicUrl(safeName),
        mimeType: mime,
        size: stat.size,
      },
    });
  });
}
