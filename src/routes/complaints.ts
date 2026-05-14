import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const complaintSchema = z.object({
  publicationId: z.string().min(1),
  reason: z.string().min(3).max(120),
  details: z.string().max(2000).optional().nullable(),
});

export default async function complaintsRoutes(app: FastifyInstance) {
  // ── Подать жалобу на карточку Реестра ──
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = complaintSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const { publicationId, reason, details } = parsed.data;

    const pub = await prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) return reply.code(404).send({ error: 'Публикация не найдена' });

    const complaint = await prisma.complaint.create({
      data: {
        publicationId,
        reporterId: req.user!.sub,
        reason,
        details: details || null,
      },
    });

    return reply.code(201).send({ complaint });
  });

  // ── Мои отправленные жалобы (для информации в кабинете) ──
  app.get('/mine', { preHandler: requireAuth }, async (req) => {
    const items = await prisma.complaint.findMany({
      where: { reporterId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: { publication: { select: { id: true, title: true } } },
    });
    return { items };
  });
}
