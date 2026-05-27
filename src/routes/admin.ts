import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;
  const email = req.user?.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return reply.code(403).send({ error: 'Доступ только для модераторов' });
  }
}

const rejectSchema = z.object({
  reason: z.string().min(3).max(500),
});

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/profiles', { preHandler: requireAdmin }, async (req) => {
    const q = (req.query as { status?: string })?.status?.toUpperCase();
    const validStatuses = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const;
    const where = validStatuses.includes(q as (typeof validStatuses)[number])
      ? { status: q as (typeof validStatuses)[number] }
      : {};

    const profiles = await prisma.companyProfile.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, phone: true, role: true },
        },
      },
    });
    return { profiles };
  });

  app.post('/profiles/:id/verify', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = await prisma.companyProfile.findUnique({ where: { id } });
    if (!profile) return reply.code(404).send({ error: 'Профиль не найден' });

    // ─── State-machine guard ───
    // Верифицируем только из SUBMITTED или REJECTED (revert). DRAFT не должен
    // верифицироваться — у него submittedAt:null, юзер не подавал заявку.
    // Без этого администратор мог случайно «подтвердить» черновик и получить
    // VERIFIED-профиль без submittedAt, что ломает аудит-цепочку.
    if (profile.status !== 'SUBMITTED' && profile.status !== 'REJECTED') {
      return reply.code(409).send({
        error: `Нельзя верифицировать профиль в статусе ${profile.status}. Юзер должен сначала подать заявку.`,
      });
    }

    const updated = await prisma.companyProfile.update({
      where: { id },
      data: { status: 'VERIFIED', verifiedAt: new Date(), rejectedReason: null },
    });
    return { profile: updated };
  });

  app.post('/profiles/:id/reject', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите причину (3–500 символов)' });
    }
    const profile = await prisma.companyProfile.findUnique({ where: { id } });
    if (!profile) return reply.code(404).send({ error: 'Профиль не найден' });

    const updated = await prisma.companyProfile.update({
      where: { id },
      data: { status: 'REJECTED', rejectedReason: parsed.data.reason },
    });
    return { profile: updated };
  });
}
