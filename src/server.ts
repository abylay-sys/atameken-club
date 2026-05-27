import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { env } from './lib/env';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import adminRoutes from './routes/admin';
import servicesRoutes from './routes/services';
import publicationsRoutes from './routes/publications';
import favoritesRoutes from './routes/favorites';
import complaintsRoutes from './routes/complaints';
import walletRoutes from './routes/wallet';
import uploadsRoutes from './routes/uploads';
import dealsRoutes from './routes/deals';
import chatRoutes from './routes/chat';
import fs from 'node:fs';
import { s3Enabled } from './lib/s3';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'debug' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
  });

  // ─── Rate limiting ───
  // Глобально: 100 req/min/IP. Жёсткие лимиты на чувствительные endpoint'ы
  // навешиваются индивидуально через preHandler (см. auth/forgot routes).
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    // Не лимитируем preflight + health + статику
    skipOnError: false,
    keyGenerator: (req) => (req.headers['cf-connecting-ip'] as string) || (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
    allowList: (req) => req.url === '/health',
    errorResponseBuilder: () => ({ error: 'Слишком много запросов. Попробуйте через минуту.' }),
  });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(profileRoutes, { prefix: '/profile' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(servicesRoutes, { prefix: '/services' });
  await app.register(publicationsRoutes, { prefix: '/publications' });
  await app.register(favoritesRoutes, { prefix: '/favorites' });
  await app.register(complaintsRoutes, { prefix: '/complaints' });
  await app.register(walletRoutes, { prefix: '/wallet' });
  await app.register(uploadsRoutes, { prefix: '/uploads' });
  await app.register(dealsRoutes, { prefix: '/deals' });
  await app.register(chatRoutes, { prefix: '/chat' });

  // Раздаём загруженные файлы как статику ТОЛЬКО если S3 не настроен (dev-режим).
  // В прод S3-режиме файлы отдаются напрямую с CDN провайдера (R2/Spaces), а
  // /uploads/* остаётся свободным маршрутом.
  if (!s3Enabled) {
    if (!fs.existsSync(env.UPLOAD_DIR)) fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
    await app.register(fastifyStatic, {
      root: env.UPLOAD_DIR,
      prefix: '/uploads/',
      decorateReply: false,
      serve: true,
    });
  }

  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
    decorateReply: false,
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'unhandled error');
    // Whitelist error codes которым можно «голос наружу»:
    // - 400 (validation): часто из zod, у нас уже санитизировано в роутах
    // - 401, 403: явные auth-ошибки
    // - 404, 409, 413, 415, 429: бизнес-ошибки с понятным сообщением
    // Остальные 4xx — общее «Некорректный запрос» (не светим внутренние Prisma/Fastify сообщения)
    const safeCodes = new Set([400, 401, 403, 404, 409, 413, 415, 429]);
    if (err.statusCode && err.statusCode < 500) {
      const msg = safeCodes.has(err.statusCode) ? err.message : 'Некорректный запрос';
      return reply.code(err.statusCode).send({ error: msg });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
