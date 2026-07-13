import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { normalizeLang, translationEnabled } from '../services/translation';
import { pubFields, ensureTranslation, type TransBlob } from './publications';

export default async function favoritesRoutes(app: FastifyInstance) {
  // ── Мои избранные публикации ──
  app.get('/mine', { preHandler: requireAuth }, async (req) => {
    const rows = await prisma.favorite.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        publication: {
          select: {
            id: true,
            type: true,
            title: true,
            industry: true,
            region: true,
            shortDesc: true,
            priceLabel: true,
            publishedAt: true,
            status: true,
            // data/translations нужны для авто-перевода карточки; наружу НЕ отдаём.
            data: true,
            translations: true,
          },
        },
      },
    });

    // Целевой язык (?lang=). Для не-ru навешиваем перевод карточки (общий кэш с Реестром).
    const lang = normalizeLang((req.query as any).lang);
    const doTranslate = lang !== 'ru' && translationEnabled();
    const published = rows.filter((r) => r.publication.status === 'PUBLISHED');

    const items = await Promise.all(
      published.map(async (r) => {
        const p = r.publication as any;
        let t: Record<string, string> | null = null;
        if (doTranslate) {
          try {
            t = await ensureTranslation(p.id, lang, pubFields(p), (p.translations as TransBlob | null) || null);
          } catch (_) {
            t = null; // при сбое показываем оригинал
          }
        }
        // Не светим data/translations во внешнюю выдачу — только безопасные поля карточки.
        const { data: _data, translations: _translations, ...pubSafe } = p;
        return { favoriteId: r.id, createdAt: r.createdAt, publication: { ...pubSafe, ...(t ? { t } : {}) } };
      }),
    );
    return { items };
  });

  // ── Добавить в избранное ──
  app.post('/:publicationId', { preHandler: requireAuth }, async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };
    const pub = await prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) return reply.code(404).send({ error: 'Публикация не найдена' });

    try {
      const fav = await prisma.favorite.create({
        data: { userId: req.user!.sub, publicationId },
      });
      return reply.code(201).send({ favorite: fav });
    } catch (e: any) {
      // Unique violation = уже в избранном — отдаём 200 idempotently
      if (e.code === 'P2002') return reply.send({ ok: true, alreadyFavorited: true });
      throw e;
    }
  });

  // ── Убрать из избранного ──
  app.delete('/:publicationId', { preHandler: requireAuth }, async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };
    await prisma.favorite.deleteMany({
      where: { userId: req.user!.sub, publicationId },
    });
    return reply.send({ ok: true });
  });
}
