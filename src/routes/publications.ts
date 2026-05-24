import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth } from '../middleware/auth';

// 4 типа публикации соответствуют 4 категориям «условных продавцов»
const PUBLICATION_TYPES = ['INVEST_PROJECT', 'FRANCHISE', 'BUSINESS_FOR_SALE', 'GOODS'] as const;

const createSchema = z.object({
  type: z.enum(PUBLICATION_TYPES),
  // Денормализованные поля для каталога
  title: z.string().min(2).max(200),
  industry: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  shortDesc: z.string().max(2000).optional().nullable(),
  priceLabel: z.string().max(120).optional().nullable(),
  // Весь набор полей формы (4 типа разные) — храним как JSON
  data: z.record(z.unknown()),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'REMOVED']).optional(),
});

export default async function publicationsRoutes(app: FastifyInstance) {
  // ── Публичный каталог (для Реестра) ──
  // Возвращает только PUBLISHED. Без авторизации — открытые данные.
  app.get('/', { preHandler: optionalAuth }, async (req) => {
    const qp = req.query as { type?: string; industry?: string; region?: string; limit?: string; page?: string; q?: string };
    const type = qp.type && PUBLICATION_TYPES.includes(qp.type as any) ? (qp.type as any) : undefined;
    const limit = Math.min(Math.max(Number(qp.limit) || 15, 1), 100);
    const page = Math.max(Number(qp.page) || 1, 1);
    const skip = (page - 1) * limit;

    // Полнотекстовый поиск по title / shortDesc / industry — ключевые слова из qp.q
    const searchTerm = (qp.q || '').trim();
    const searchFilter = searchTerm
      ? {
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' as const } },
            { shortDesc: { contains: searchTerm, mode: 'insensitive' as const } },
            { industry: { contains: searchTerm, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const where = {
      status: 'PUBLISHED' as const,
      ...(type ? { type } : {}),
      ...(qp.industry ? { industry: { contains: qp.industry, mode: 'insensitive' as const } } : {}),
      ...(qp.region ? { region: { contains: qp.region, mode: 'insensitive' as const } } : {}),
      ...searchFilter,
    };

    const [items, total] = await Promise.all([
      prisma.publication.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip,
        // Не светим userId и контактные поля из data на публичной выдаче — это «короткая» карточка
        select: {
          id: true,
          type: true,
          title: true,
          industry: true,
          region: true,
          shortDesc: true,
          priceLabel: true,
          publishedAt: true,
        },
      }),
      prisma.publication.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) };
  });

  // ── Развёрнутая карточка (платная — пока без gating, заглушка) ──
  // GET /:id — возвращает полный data объект. Когда подключим оплату Развёрнутой карточки,
  // здесь добавим проверку: либо пользователь купил карточку, либо это его собственная.
  app.get('/:id', { preHandler: optionalAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pub = await prisma.publication.findUnique({ where: { id } });
    if (!pub || pub.status !== 'PUBLISHED') {
      return reply.code(404).send({ error: 'Публикация не найдена' });
    }
    // TODO: gate full data behind «Развёрнутая карточка» purchase
    const isOwner = req.user?.sub === pub.userId;
    return {
      publication: {
        id: pub.id,
        type: pub.type,
        title: pub.title,
        industry: pub.industry,
        region: pub.region,
        shortDesc: pub.shortDesc,
        priceLabel: pub.priceLabel,
        publishedAt: pub.publishedAt,
        data: isOwner ? pub.data : pub.data, // пока без gating
        isOwner,
      },
    };
  });

  // ── Список собственных публикаций пользователя ──
  app.get('/mine', { preHandler: requireAuth }, async (req) => {
    const items = await prisma.publication.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  });

  // ── Создание публикации ──
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const { type, title, industry, region, shortDesc, priceLabel, data } = parsed.data;

    const pub = await prisma.publication.create({
      data: {
        userId: req.user!.sub,
        type,
        title,
        industry: industry || null,
        region: region || null,
        shortDesc: shortDesc || null,
        priceLabel: priceLabel || null,
        data: data as any,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    return reply.code(201).send({ publication: pub });
  });

  // ── Обновление собственной публикации ──
  app.put('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const existing = await prisma.publication.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Публикация не найдена' });
    if (existing.userId !== req.user!.sub) {
      return reply.code(403).send({ error: 'Нет доступа к этой публикации' });
    }

    const pub = await prisma.publication.update({
      where: { id },
      data: {
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.industry !== undefined ? { industry: parsed.data.industry } : {}),
        ...(parsed.data.region !== undefined ? { region: parsed.data.region } : {}),
        ...(parsed.data.shortDesc !== undefined ? { shortDesc: parsed.data.shortDesc } : {}),
        ...(parsed.data.priceLabel !== undefined ? { priceLabel: parsed.data.priceLabel } : {}),
        ...(parsed.data.data !== undefined ? { data: parsed.data.data as any } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });
    return { publication: pub };
  });

  // ── Удаление (soft) собственной публикации ──
  app.delete('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.publication.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Публикация не найдена' });
    if (existing.userId !== req.user!.sub) {
      return reply.code(403).send({ error: 'Нет доступа к этой публикации' });
    }
    await prisma.publication.update({
      where: { id },
      data: { status: 'REMOVED' },
    });
    return { ok: true };
  });
}
