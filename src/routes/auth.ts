import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, sha256, randomToken } from '../lib/hash';
import { signAccessToken, refreshExpiryDate } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';

// Текущая версия Пользовательского соглашения. Меняем при правках текста —
// пользователи, регистрирующиеся после этой даты, фиксируются с новой версией.
const TERMS_VERSION = '2026.05.1';

const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
  role: z.enum(['SEEKER', 'INVESTOR', 'FRANCHISE', 'SALE', 'FRANCHISER', 'FRANCHISEE', 'BIZ_SELLER', 'BIZ_BUYER', 'GOODS_SELLER', 'GOODS_BUYER']),
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(32).optional(),
  // Click-wrap: фронт обязан передать true после галочки в модалке.
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'Необходимо принять Пользовательское соглашение' }) }),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

function issueTokensFor(user: { id: string; email: string; role: string }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = randomToken(48);
  return { accessToken, refreshToken };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const { email, password, role, fullName, phone } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email, passwordHash, role, fullName, phone,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    });

    const { accessToken, refreshToken } = issueTokensFor(user);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiryDate(),
      },
    });

    return reply.code(201).send({
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      accessToken,
      refreshToken,
    });
  });

  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }

    const { accessToken, refreshToken } = issueTokensFor(user);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiryDate(),
      },
    });

    return reply.send({
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      accessToken,
      refreshToken,
    });
  });

  app.post('/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }
    const tokenHash = sha256(parsed.data.refreshToken);

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Refresh token недействителен' });
    }

    const { accessToken, refreshToken } = issueTokensFor(stored.user);

    // rotate: revoke old, issue new
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: sha256(refreshToken),
          expiresAt: refreshExpiryDate(),
        },
      }),
    ]);

    return reply.send({ accessToken, refreshToken });
  });

  app.post('/logout', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(body.refreshToken), userId: req.user!.sub },
        data: { revokedAt: new Date() },
      });
    }
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        phone: true,
        emailVerified: true,
        createdAt: true,
        profile: {
          select: { id: true, companyName: true, status: true, submittedAt: true },
        },
      },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send({ user });
  });
}
