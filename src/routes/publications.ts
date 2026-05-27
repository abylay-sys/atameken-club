import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth } from '../middleware/auth';

// 4 типа публикации соответствуют 4 категориям «условных продавцов»
const PUBLICATION_TYPES = ['INVEST_PROJECT', 'FRANCHISE', 'BUSINESS_FOR_SALE', 'GOODS'] as const;

// ─── Sub-schemas для data — валидируем по типу публикации ───
// Раньше: `data: z.record(z.unknown())` — принимали любой JSON. Атакующий мог
// прислать 50MB строку или с произвольной структурой. Теперь каждое поле
// ограничено по длине, URL'ы проверяются на http(s), unknown ключи DROP'аются
// через `.strip()` (default zod behavior).
//
// fileRef — для bizplan/finmodel/standards/finReports/productionDocs/photo
const fileRef = z.object({
  url: z.string().url().max(2000),
  name: z.string().max(300).optional(),
});

// Общие поля для всех 4 типов
const commonShape = {
  photo: fileRef.optional().nullable(),
  verifications: z.array(z.string().max(64)).max(20).optional(),
  isResident: z.boolean().optional(),
  contactName: z.string().max(200).optional(),
  contactInfo: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
};

const investData = z.object({
  ...commonShape,
  projectName: z.string().max(300).optional(),
  industry: z.string().max(200).optional(),
  stage: z.string().max(100).optional(),
  amount: z.string().max(200).optional(),
  payback: z.string().max(200).optional(),
  equity: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  bizplan: fileRef.optional().nullable(),
  finmodel: fileRef.optional().nullable(),
});

const franchiseData = z.object({
  ...commonShape,
  brand: z.string().max(300).optional(),
  industry: z.string().max(200).optional(),
  points: z.string().max(300).optional(),
  paushal: z.string().max(200).optional(),
  royalty: z.string().max(200).optional(),
  marketing: z.string().max(200).optional(),
  payback: z.string().max(200).optional(),
  geography: z.string().max(300).optional(),
  support: z.string().max(3000).optional(),
  standards: fileRef.optional().nullable(),
});

const bizSaleData = z.object({
  ...commonShape,
  businessType: z.string().max(300).optional(),
  industry: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  founded: z.string().max(20).optional(),
  employees: z.string().max(50).optional(),
  revenue: z.string().max(200).optional(),
  ebitda: z.string().max(200).optional(),
  price: z.string().max(200).optional(),
  reason: z.string().max(500).optional(),
  whatIncluded: z.string().max(3000).optional(),
  finReports: fileRef.optional().nullable(),
});

const goodsData = z.object({
  ...commonShape,
  product: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  industry: z.string().max(200).optional(),
  volume: z.string().max(200).optional(),
  minBatch: z.string().max(200).optional(),
  price: z.string().max(200).optional(),
  incoterms: z.string().max(200).optional(),
  payment: z.string().max(500).optional(),
  certificates: z.string().max(500).optional(),
  composition: z.string().max(3000).optional(),
  productionDocs: fileRef.optional().nullable(),
});

const dataSchemaByType: Record<typeof PUBLICATION_TYPES[number], z.ZodTypeAny> = {
  INVEST_PROJECT: investData,
  FRANCHISE: franchiseData,
  BUSINESS_FOR_SALE: bizSaleData,
  GOODS: goodsData,
};

const createSchema = z.object({
  type: z.enum(PUBLICATION_TYPES),
  // Денормализованные поля для каталога
  title: z.string().min(2).max(200),
  industry: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  shortDesc: z.string().max(2000).optional().nullable(),
  priceLabel: z.string().max(120).optional().nullable(),
  // Сначала принимаем data как unknown record, потом сужаем по type
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

    const [rawItems, total] = await Promise.all([
      prisma.publication.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip,
        // Берём всё что нужно для публичной карточки. Из data в публичную
        // выдачу попадают только безопасные поля: photo, verifications, isResident.
        // Контакты и закрытые документы НЕ светим — для них есть GET /:id с гейтингом.
        select: {
          id: true,
          type: true,
          title: true,
          industry: true,
          region: true,
          shortDesc: true,
          priceLabel: true,
          publishedAt: true,
          data: true,
        },
      }),
      prisma.publication.count({ where }),
    ]);
    // Фильтруем data — оставляем только публично-безопасные поля
    const items = rawItems.map((p) => {
      const d = (p.data as Record<string, unknown> | null) || null;
      const safeData = d
        ? {
            photo: d.photo ?? null,
            verifications: Array.isArray(d.verifications) ? d.verifications : [],
            isResident: !!d.isResident,
          }
        : null;
      return { ...p, data: safeData };
    });
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
    // ─── Gate приватных данных за платный доступ ───
    // Полный data (контакты, бизнес-план URL, финмодель URL) виден только:
    //   1. автору публикации (isOwner)
    //   2. купившему «Развёрнутую карточку» через токены (PurchasedCard)
    //   3. админу-модератору (req.user.email в ADMIN_EMAILS)
    // Гостям и обычным юзерам без покупки — только публичные поля + photo + shevrons.
    const isOwner = req.user?.sub === pub.userId;
    let hasFullAccess = isOwner;
    if (!hasFullAccess && req.user?.sub) {
      const purchased = await prisma.purchasedCard.findUnique({
        where: { userId_publicationId: { userId: req.user.sub, publicationId: pub.id } },
        select: { id: true },
      });
      if (purchased) hasFullAccess = true;
    }
    // Админ-модераторы (читают список заявок) тоже видят полный data
    if (!hasFullAccess && req.user?.email) {
      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (adminEmails.includes(req.user.email.toLowerCase())) hasFullAccess = true;
    }

    const rawData = (pub.data as Record<string, unknown> | null) || null;
    let publicData: Record<string, unknown> | null = null;
    if (hasFullAccess) {
      publicData = rawData;
    } else if (rawData) {
      // Публичная версия — только фото, шевроны, статус резидента + safe-метаданные
      publicData = {
        photo: rawData.photo ?? null,
        verifications: Array.isArray(rawData.verifications) ? rawData.verifications : [],
        isResident: !!rawData.isResident,
      };
    }
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
        data: publicData,
        isOwner,
        hasFullAccess,
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

    // ─── Вторая фаза: валидация data по конкретному типу публикации ───
    // Каждый тип имеет свой набор полей (см. dataSchemaByType вверху файла).
    // `.parse()` бросит ZodError если структура не совпадает.
    const dataValidator = dataSchemaByType[type];
    const dataParsed = dataValidator.safeParse(data);
    if (!dataParsed.success) {
      return reply.code(400).send({
        error: 'Некорректные данные публикации',
        details: dataParsed.error.flatten(),
      });
    }

    const pub = await prisma.publication.create({
      data: {
        userId: req.user!.sub,
        type,
        title,
        industry: industry || null,
        region: region || null,
        shortDesc: shortDesc || null,
        priceLabel: priceLabel || null,
        data: dataParsed.data as any,
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

    // Если в update пришло поле `data` — валидируем по существующему типу публикации
    // (тип не меняется при update; если меняется через `type` поле — тоже учитываем).
    let validatedData: unknown = undefined;
    if (parsed.data.data !== undefined) {
      const effectiveType = parsed.data.type || existing.type;
      const dataValidator = dataSchemaByType[effectiveType as typeof PUBLICATION_TYPES[number]];
      if (!dataValidator) {
        return reply.code(400).send({ error: 'Неизвестный тип публикации' });
      }
      const dataParsed = dataValidator.safeParse(parsed.data.data);
      if (!dataParsed.success) {
        return reply.code(400).send({
          error: 'Некорректные данные публикации',
          details: dataParsed.error.flatten(),
        });
      }
      validatedData = dataParsed.data;
    }

    const pub = await prisma.publication.update({
      where: { id },
      data: {
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.industry !== undefined ? { industry: parsed.data.industry } : {}),
        ...(parsed.data.region !== undefined ? { region: parsed.data.region } : {}),
        ...(parsed.data.shortDesc !== undefined ? { shortDesc: parsed.data.shortDesc } : {}),
        ...(parsed.data.priceLabel !== undefined ? { priceLabel: parsed.data.priceLabel } : {}),
        ...(validatedData !== undefined ? { data: validatedData as any } : {}),
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
