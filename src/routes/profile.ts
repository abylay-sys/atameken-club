import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { appendProfileToSheet } from '../services/sheets';
import { notifyModerators } from '../services/telegram';

const profileSchema = z.object({
  companyName: z.string().min(2).max(200),
  bin: z.string().max(32).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  descriptionFull: z.string().max(20000).optional().nullable(),
  recommendation: z.string().max(2000).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  instagram: z.string().max(200).optional().nullable(),
  facebook: z.string().max(200).optional().nullable(),
  linkedin: z.string().max(200).optional().nullable(),
  telegram: z.string().max(200).optional().nullable(),
  whatsapp: z.string().max(200).optional().nullable(),
  foundedYear: z.number().int().min(1900).max(2100).optional().nullable(),
  revenue: z.string().max(120).optional().nullable(),
  employees: z.string().max(60).optional().nullable(),
  investmentNeed: z.string().max(120).optional().nullable(),
  investmentGoal: z.string().max(1000).optional().nullable(),
  contactName: z.string().max(120).optional().nullable(),
  contactPhone: z.string().max(32).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
});

export default async function profileRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireAuth }, async (req, reply) => {
    const profile = await prisma.companyProfile.findUnique({
      where: { userId: req.user!.sub },
    });
    return reply.send({ profile });
  });

  app.put('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const data = parsed.data;

    const profile = await prisma.companyProfile.upsert({
      where: { userId: req.user!.sub },
      update: { ...data },
      create: { userId: req.user!.sub, ...data },
    });

    return reply.send({ profile });
  });

  app.post('/submit', { preHandler: requireAuth }, async (req, reply) => {
    const profile = await prisma.companyProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { user: true },
    });
    if (!profile) {
      return reply.code(400).send({ error: 'Сначала заполните профиль компании' });
    }
    if (profile.status === 'SUBMITTED' || profile.status === 'VERIFIED') {
      return reply.code(409).send({ error: 'Профиль уже отправлен на проверку' });
    }
    if (!profile.companyName || !profile.description) {
      return reply.code(400).send({ error: 'Заполните название и описание компании' });
    }

    const updated = await prisma.companyProfile.update({
      where: { id: profile.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    // Fire-and-forget integrations — не блокируем ответ клиенту
    appendProfileToSheet(updated, profile.user).catch((e) =>
      req.log.error({ err: e }, 'Google Sheets append failed'),
    );
    notifyModerators(updated, profile.user).catch((e) =>
      req.log.error({ err: e }, 'Telegram notify failed'),
    );

    return reply.send({ profile: updated });
  });
}
