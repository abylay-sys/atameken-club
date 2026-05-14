import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DealStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { renderDocument, TEMPLATE_VERSION } from '../services/legal-templates';

const DOC_TYPES = ['NDA', 'NCNDA', 'COMMISSION'] as const;

const createSchema = z.object({
  publicationId: z.string().optional().nullable(),
  splitWithCounter: z.boolean().default(false),
  dealAmountKzt: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const signSchema = z.object({
  type: z.enum(DOC_TYPES),
  accept: z.literal(true),
});

export default async function dealsRoutes(app: FastifyInstance) {
  // ── Создать сделку: автоматически 3 PENDING SignedDocument-записи ──
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const deal = await prisma.deal.create({
      data: {
        initiatorId: req.user!.sub,
        publicationId: parsed.data.publicationId || null,
        splitWithCounter: parsed.data.splitWithCounter,
        dealAmountKzt: parsed.data.dealAmountKzt || null,
        notes: parsed.data.notes || null,
        signatures: {
          create: DOC_TYPES.map((type) => ({
            userId: req.user!.sub,
            type,
            status: 'PENDING',
          })),
        },
      },
      include: { signatures: true },
    });
    return reply.code(201).send({ deal });
  });

  // ── Мои сделки ──
  app.get('/mine', { preHandler: requireAuth }, async (req) => {
    const items = await prisma.deal.findMany({
      where: { initiatorId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        signatures: { select: { type: true, status: true, signedAt: true } },
        publication: { select: { id: true, title: true, type: true } },
      },
    });
    return { items };
  });

  // ── Деталка сделки ──
  app.get('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        signatures: true,
        publication: { select: { id: true, title: true, type: true } },
      },
    });
    if (!deal) return reply.code(404).send({ error: 'Сделка не найдена' });
    if (deal.initiatorId !== req.user!.sub) return reply.code(403).send({ error: 'Нет доступа' });
    return { deal };
  });

  // ── Получить HTML документа (с подставленными плейсхолдерами) ──
  app.get('/:id/document/:type', { preHandler: requireAuth }, async (req, reply) => {
    const { id, type } = req.params as { id: string; type: string };
    if (!DOC_TYPES.includes(type as any)) return reply.code(400).send({ error: 'Неверный тип документа' });

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: { initiator: { include: { profile: true } }, publication: { select: { title: true } } },
    });
    if (!deal) return reply.code(404).send({ error: 'Сделка не найдена' });
    if (deal.initiatorId !== req.user!.sub) return reply.code(403).send({ error: 'Нет доступа' });

    const fullName = deal.initiator.fullName || deal.initiator.profile?.companyName || deal.initiator.email;
    const html = renderDocument(type as any, {
      dealId: deal.id,
      fullName,
      email: deal.initiator.email,
      date: new Date().toLocaleDateString('ru-KZ', { day: '2-digit', month: 'long', year: 'numeric' }),
      publicationTitle: deal.publication?.title,
      commissionPct: deal.commissionPct,
      splitWithCounter: deal.splitWithCounter,
    });
    return { type, version: TEMPLATE_VERSION, html };
  });

  // ── Подписать конкретный документ ──
  app.post('/:id/sign', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = signSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: { signatures: true },
    });
    if (!deal) return reply.code(404).send({ error: 'Сделка не найдена' });
    if (deal.initiatorId !== req.user!.sub) return reply.code(403).send({ error: 'Нет доступа' });
    if (deal.status === 'CANCELED' || deal.status === 'COMPLETED') {
      return reply.code(409).send({ error: 'Сделка закрыта' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    const ua = (req.headers['user-agent'] || '').toString();

    const sig = await prisma.signedDocument.update({
      where: { dealId_userId_type: { dealId: id, userId: req.user!.sub, type: parsed.data.type } },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        ipAddress: ip,
        userAgent: ua,
        templateVer: TEMPLATE_VERSION,
      },
    });

    // Если все 3 документа подписаны — двигаем статус сделки на DOCS_SIGNED
    const all = await prisma.signedDocument.findMany({
      where: { dealId: id, userId: req.user!.sub, type: { in: ['NDA', 'NCNDA', 'COMMISSION'] } },
    });
    const allSigned = all.length === 3 && all.every((s) => s.status === 'SIGNED');
    let updatedStatus: DealStatus = deal.status;
    if (allSigned && deal.status === 'DOCS_PENDING') {
      const updated = await prisma.deal.update({
        where: { id },
        data: { status: 'DOCS_SIGNED' },
      });
      updatedStatus = updated.status;
    }
    return { signature: sig, dealStatus: updatedStatus, allSigned };
  });

  // ── Отменить сделку (черновик пока ничего не подписано или нужна другая логика) ──
  app.post('/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return reply.code(404).send({ error: 'Сделка не найдена' });
    if (deal.initiatorId !== req.user!.sub) return reply.code(403).send({ error: 'Нет доступа' });
    if (deal.status === 'COMPLETED') return reply.code(409).send({ error: 'Сделка уже завершена' });
    const updated = await prisma.deal.update({ where: { id }, data: { status: 'CANCELED' } });
    return { deal: updated };
  });
}
