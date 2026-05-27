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

// ─── Магия-байты для каждого формата (защита от спуфинга MIME) ───
// Атакующий может прислать .html с Content-Type: application/pdf — без проверки
// мы примем, S3 положит файл с inline-Disposition, и можно хостить фишинг
// на нашем домене. Проверяем первые байты буфера по сигнатуре формата.
function validateMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.length < 4) return false;
  switch (mime) {
    case 'application/pdf':
      // %PDF
      return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    case 'image/png':
      // 89 50 4E 47 0D 0A 1A 0A
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    case 'image/jpeg':
      // FF D8 FF
      return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    case 'image/webp':
      // RIFF....WEBP — буф должен иметь хотя бы 12 байт
      return buf.length >= 12
        && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
        && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':  // xlsx
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':  // docx
      // ZIP magic: PK\x03\x04
      return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    case 'application/vnd.ms-excel':  // xls
    case 'application/msword':        // doc
      // OLE/CFB: D0 CF 11 E0 A1 B1 1A E1
      return buf.length >= 8
        && buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0
        && buf[4] === 0xA1 && buf[5] === 0xB1 && buf[6] === 0x1A && buf[7] === 0xE1;
    case 'text/csv': {
      // CSV — текстовый, без магии. Эвристика: первые 256 байт ASCII-печатаемые
      // + CR/LF/TAB. Никаких null-байт.
      const sample = buf.slice(0, Math.min(buf.length, 256));
      for (let i = 0; i < sample.length; i++) {
        const c = sample[i];
        if (c === 0) return false;
        if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) return false;
      }
      return true;
    }
    default:
      return false;
  }
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

    // ─── Буферим весь файл (max 10MB) — нужно для magic-byte валидации ───
    // Не теряем потоковости т.к. размер ограничен — всё помещается в RAM.
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

    // ─── Magic-byte sniff: проверяем что реальное содержимое соответствует MIME ───
    // Без этого можно подсунуть .html под видом application/pdf, и файл будет
    // хоститься на нашем домене → фишинг под нашим брендом.
    if (!validateMagicBytes(buf, mime)) {
      return reply.code(415).send({
        error: 'Содержимое файла не соответствует заявленному типу',
      });
    }

    // ─── Content-Disposition: attachment для документов (не картинок) ───
    // PDF/DOCX/XLSX в браузере не отрендерится как страница → даже если что-то
    // протекло через magic-byte, оно скачается, а не откроется в iframe.
    const isImage = mime.startsWith('image/');
    const disposition = isImage
      ? `inline; filename="${encodeURIComponent(data.filename || safeName)}"`
      : `attachment; filename="${encodeURIComponent(data.filename || safeName)}"`;

    // ── Режим 1: S3 (production) ──
    if (s3Enabled) {
      try {
        const key = s3Key(safeName);
        await s3PutObject({
          key,
          body: buf,
          contentType: mime,
          contentDisposition: disposition,
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
      fs.writeFileSync(fullPath, buf);
    } catch (e: any) {
      req.log.error({ err: e }, 'upload write failed');
      try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
      return reply.code(500).send({ error: 'Не удалось сохранить файл' });
    }

    return reply.code(201).send({
      file: {
        filename: safeName,
        originalName: data.filename,
        url: localPublicUrl(safeName),
        mimeType: mime,
        size: buf.length,
      },
    });
  });
}
