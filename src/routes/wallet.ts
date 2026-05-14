import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

// Пакеты токенов с фиксированными скидками.
// Если в дальнейшем подключим оплату через Kaspi/Stripe — стоимость считается
// здесь же, чтобы клиент не мог подменить.
const PACKAGES = {
  10:  { tokens: 10,  priceUsd: 50,  discount: 0   },
  25:  { tokens: 25,  priceUsd: 115, discount: 8   },
  50:  { tokens: 50,  priceUsd: 220, discount: 12  },
  100: { tokens: 100, priceUsd: 400, discount: 20  },
} as const;

const purchaseSchema = z.object({ packageSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]) });
const spendSchema = z.object({ publicationId: z.string().min(1) });

async function getOrCreateWallet(userId: string) {
  return prisma.tokenWallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export default async function walletRoutes(app: FastifyInstance) {
  // ── Баланс + последние транзакции ──
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const wallet = await getOrCreateWallet(req.user!.sub);
    const transactions = await prisma.tokenTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { wallet: { balance: wallet.balance, totalEarned: wallet.totalEarned, totalSpent: wallet.totalSpent }, transactions };
  });

  // ── Купить пакет ── (пока без реальной оплаты — добавляем токены сразу и
  // фиксируем PURCHASE-транзакцию. При подключении Kaspi/Stripe этот эндпоинт
  // станет колбэком после успешного платежа.)
  app.post('/purchase', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const pkg = PACKAGES[parsed.data.packageSize];
    const wallet = await getOrCreateWallet(req.user!.sub);
    const newBalance = wallet.balance + pkg.tokens;
    const [updated] = await prisma.$transaction([
      prisma.tokenWallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance, totalEarned: { increment: pkg.tokens } },
      }),
      prisma.tokenTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PURCHASE',
          amount: pkg.tokens,
          balanceAfter: newBalance,
          meta: { packageSize: parsed.data.packageSize, priceUsd: pkg.priceUsd, discount: pkg.discount } as any,
        },
      }),
    ]);
    return reply.code(201).send({ wallet: { balance: updated.balance, totalEarned: updated.totalEarned, totalSpent: updated.totalSpent }, package: pkg });
  });

  // ── Открыть «Развёрнутую карточку» (1 токен) ──
  // Идемпотентно: при повторном вызове на ту же публикацию возвращает 200 без
  // списания (PurchasedCard уже есть).
  app.post('/spend/card', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = spendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const { publicationId } = parsed.data;
    const pub = await prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) return reply.code(404).send({ error: 'Публикация не найдена' });
    if (pub.userId === req.user!.sub) {
      return reply.send({ ok: true, alreadyOwner: true });
    }
    const existing = await prisma.purchasedCard.findUnique({
      where: { userId_publicationId: { userId: req.user!.sub, publicationId } },
    });
    if (existing) {
      return reply.send({ ok: true, alreadyPurchased: true });
    }
    const wallet = await getOrCreateWallet(req.user!.sub);
    if (wallet.balance < 1) {
      return reply.code(402).send({ error: 'Недостаточно токенов', balance: wallet.balance });
    }
    const newBalance = wallet.balance - 1;
    await prisma.$transaction([
      prisma.tokenWallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance, totalSpent: { increment: 1 } },
      }),
      prisma.tokenTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'SPEND_CARD',
          amount: -1,
          balanceAfter: newBalance,
          meta: { publicationId } as any,
        },
      }),
      prisma.purchasedCard.create({
        data: { userId: req.user!.sub, publicationId, tokensSpent: 1 },
      }),
    ]);
    return reply.code(201).send({ ok: true, newBalance });
  });

  // ── Список купленных карточек ──
  app.get('/purchased', { preHandler: requireAuth }, async (req) => {
    const items = await prisma.purchasedCard.findMany({
      where: { userId: req.user!.sub },
      orderBy: { purchasedAt: 'desc' },
      include: {
        publication: { select: { id: true, title: true, type: true, industry: true, region: true, priceLabel: true } },
      },
    });
    return { items };
  });
}
