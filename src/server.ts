import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { env } from './lib/env';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import adminRoutes from './routes/admin';
import servicesRoutes from './routes/services';
import publicationsRoutes from './routes/publications';

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

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(profileRoutes, { prefix: '/profile' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(servicesRoutes, { prefix: '/services' });
  await app.register(publicationsRoutes, { prefix: '/publications' });

  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
    decorateReply: false,
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'unhandled error');
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
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
