import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../middleware/auth';
import { env } from '../lib/env';

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

function publicUrlFor(filename: string): string {
  if (env.UPLOAD_PUBLIC_BASE) {
    return env.UPLOAD_PUBLIC_BASE.replace(/\/+$/, '') + '/' + filename;
  }
  return '/uploads/' + filename;
}

export default async function uploadsRoutes(app: FastifyInstance) {
  ensureUploadDir();

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
      // Файл превысил лимит — multipart кидает специальную ошибку
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
        url: publicUrlFor(safeName),
        mimeType: mime,
        size: stat.size,
      },
    });
  });
}
