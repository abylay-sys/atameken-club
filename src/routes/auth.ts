import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, sha256, randomToken } from '../lib/hash';
import { signAccessToken, refreshExpiryDate } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { env } from '../lib/env';
import { sendEmail, buildPasswordResetEmail } from '../services/email';

// Текущая версия Пользовательского Соглашения. Меняем при правках текста —
// пользователи, регистрирующиеся после этой даты, фиксируются с новой версией.
// Полный текст: /terms.html (26 разделов, под бизнес-модель ATAMEKEN Club).
const TERMS_VERSION = '2.0';

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

// ─── httpOnly refresh-cookie helpers ───
// Refresh-token живёт в httpOnly Secure cookie вместо localStorage. XSS
// (даже самый изобретательный) не может его прочитать. Cookie ограничена
// path=/auth → не уходит на /publications, /chat и др. эндпоинты — мини-
// мизируем шанс случайной утечки. SameSite=Lax — достаточно для same-origin
// (фронт + бэк на одном Render-сервисе), и не блокирует navigation-redirect
// через email-ссылки. В prod добавляем Secure (HTTPS-only).
const REFRESH_COOKIE = 'ac_refresh';
function setRefreshCookie(reply: any, refreshToken: string) {
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: 30 * 24 * 60 * 60, // 30 дней
  });
}
function clearRefreshCookie(reply: any) {
  reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
}
function readRefreshFromReq(req: any): string | null {
  // 1) cookie (новый flow), 2) body.refreshToken (backwards compat для старых клиентов)
  const fromCookie = req.cookies?.[REFRESH_COOKIE];
  if (fromCookie) return fromCookie;
  const body = (req.body ?? {}) as { refreshToken?: string };
  return body.refreshToken || null;
}

export default async function authRoutes(app: FastifyInstance) {
  // ─── Жёсткие лимиты на чувствительные auth-эндпоинты ───
  // 5 запросов в минуту с одного IP. Атаки brute-force / credential stuffing
  // / email enumeration становятся практически нереализуемыми.
  // Глобальный лимит 100/мин (server.ts) — это для остальных API.
  const authLimit: any = {
    rateLimit: { max: 5, timeWindow: '1 minute' },
  };

  app.post('/register', { config: authLimit }, async (req, reply) => {
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
    setRefreshCookie(reply, refreshToken);

    return reply.code(201).send({
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      accessToken,
      // refreshToken остаётся в body для backwards-compat со старыми клиентами,
      // но новый фронт его игнорирует — использует cookie.
      refreshToken,
    });
  });

  app.post('/login', { config: authLimit }, async (req, reply) => {
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
    setRefreshCookie(reply, refreshToken);

    return reply.send({
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      accessToken,
      refreshToken, // backwards-compat
    });
  });

  app.post('/refresh', async (req, reply) => {
    // Читаем токен: сначала из httpOnly cookie (новый flow), затем из body (старый)
    const incomingToken = readRefreshFromReq(req);
    if (!incomingToken) {
      return reply.code(401).send({ error: 'Refresh token не передан' });
    }
    const tokenHash = sha256(incomingToken);

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

    // Ставим новый refresh-token в cookie (rotation)
    setRefreshCookie(reply, refreshToken);
    return reply.send({ accessToken, refreshToken });
  });

  app.post('/logout', { preHandler: requireAuth }, async (req, reply) => {
    // Достаём refresh-token из cookie (новый flow) или body (старый)
    const incoming = readRefreshFromReq(req);
    if (incoming) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(incoming), userId: req.user!.sub },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(reply);
    return reply.send({ ok: true });
  });

  // ─── Восстановление пароля: запрос ссылки ───
  // Никогда не сообщаем "email не найден" — иначе будет утечка списка
  // зарегистрированных пользователей. Ответ всегда 200 «если email есть —
  // отправили письмо».
  const forgotSchema = z.object({
    email: z.string().email().toLowerCase().trim(),
  });
  app.post('/forgot-password', { config: authLimit }, async (req, reply) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите корректный email' });
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user) {
      // В URL юзеру идёт raw-токен, в БД сохраняем только sha256(token) — даже
      // если у атакующего будет read-доступ к БД, токены непригодны для подмены пароля.
      const token = randomToken(48);
      const tokenHash = sha256(token);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: tokenHash, passwordResetExpiresAt: expiresAt },
      });
      const resetUrl = env.APP_BASE_URL.replace(/\/+$/, '') + '/reset-password.html?token=' + encodeURIComponent(token);
      const email = buildPasswordResetEmail({ fullName: user.fullName, resetUrl });
      // fire-and-forget: даже если SMTP/Resend моргнул, не блокируем пользователя
      sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text })
        .then((result) => {
          if (!result.delivered) {
            req.log.warn({ userId: user.id, resetUrl }, 'reset-password email logged (no provider)');
          }
        })
        .catch((err) => req.log.error({ err, userId: user.id }, 'reset-password email failed'));
    }
    // Универсальный ответ — независимо от того, существует email или нет
    return reply.send({ ok: true, message: 'Если такой email зарегистрирован — ссылка для восстановления отправлена. Проверьте почту (включая «Спам»).' });
  });

  // ─── Восстановление пароля: установка нового ───
  const resetSchema = z.object({
    token: z.string().min(10).max(200),
    password: z.string().min(8).max(128),
  });
  app.post('/reset-password', { config: authLimit }, async (req, reply) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Минимум 8 символов в пароле и валидный токен' });
    }
    // Юзер вводит raw-токен из URL, в БД лежит sha256(token) — сравниваем хеши
    const tokenHash = sha256(parsed.data.token);
    const user = await prisma.user.findUnique({ where: { passwordResetToken: tokenHash } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      return reply.code(400).send({ error: 'Ссылка недействительна или истекла. Запросите новую.' });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      }),
      // Инвалидируем все refresh-токены — все сессии выйдут из системы
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return reply.send({ ok: true, message: 'Пароль обновлён. Войдите с новым паролем.' });
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
