import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

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
          },
        },
      },
    });
    // Возвращаем только активные публикации, и не пропускаем удалённые
    return {
      items: rows
        .filter((r) => r.publication.status === 'PUBLISHED')
        .map((r) => ({ favoriteId: r.id, createdAt: r.createdAt, publication: r.publication })),
    };
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
