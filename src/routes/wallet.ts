import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { env } from '../lib/env';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

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
    // ─── Атомарное списание: единственный надёжный способ при concurrent-запросах ───
    // Раньше: читали balance, считали newBalance = balance-1, потом WRITE.
    // 2 одновременных запроса → оба читают balance=1, оба пишут balance=0,
    // оба получают доступ за 1 токен (race condition).
    //
    // Теперь: updateMany с precondition `balance ≥ 1` + decrement в одной
    // SQL-операции. count===0 значит «не хватило токенов» (другой запрос
    // нас опередил, или баланс уже 0). Внутри транзакции вместе с записью
    // PurchasedCard и TokenTransaction — либо всё, либо ничего.
    try {
      const newBalance = await prisma.$transaction(async (tx) => {
        const upd = await tx.tokenWallet.updateMany({
          where: { id: wallet.id, balance: { gte: 1 } },
          data: { balance: { decrement: 1 }, totalSpent: { increment: 1 } },
        });
        if (upd.count === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        // Читаем актуальный баланс ПОСЛЕ decrement
        const after = await tx.tokenWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
        const balanceAfter = after?.balance ?? 0;
        await tx.tokenTransaction.create({
          data: { walletId: wallet.id, type: 'SPEND_CARD', amount: -1, balanceAfter, meta: { publicationId } as any },
        });
        await tx.purchasedCard.create({
          data: { userId: req.user!.sub, publicationId, tokensSpent: 1 },
        });
        return balanceAfter;
      });
      return reply.code(201).send({ ok: true, newBalance });
    } catch (err: any) {
      if (err?.message === 'INSUFFICIENT_BALANCE') {
        return reply.code(402).send({ error: 'Недостаточно токенов' });
      }
      // P2002 — кто-то параллельно купил карточку (idempotent)
      if (err?.code === 'P2002') {
        return reply.send({ ok: true, alreadyPurchased: true });
      }
      throw err;
    }
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

  // ════════════════════════════════════════════════════════════════
  // ─── Kaspi Pay: pending payments, QR, webhook, polling ──────────
  // ════════════════════════════════════════════════════════════════

  // Открытый помощник: текущий курс и режим (real/mock)
  app.get('/payment/config', async () => ({
    kztPerUsd: env.KZT_PER_USD,
    mode: env.KASPI_MERCHANT_ID ? 'live' : 'mock',
    merchantId: env.KASPI_MERCHANT_ID || null,
  }));

  // ── Создать pending-платёж ──
  app.post('/payment/init', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const pkg = PACKAGES[parsed.data.packageSize];
    const priceKzt = Math.round(pkg.priceUsd * env.KZT_PER_USD);
    // Короткий референс, который пользователь увидит в чеке Kaspi
    // 8 bytes = 16 hex chars = 2^64 пространство — практически без коллизий
    const ref = 'AC-' + randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 минут на оплату

    const pending = await prisma.pendingPayment.create({
      data: {
        userId: req.user!.sub,
        packageSize: parsed.data.packageSize,
        tokensAmount: pkg.tokens,
        priceUsd: pkg.priceUsd,
        priceKzt,
        kaspiPaymentRef: ref,
        expiresAt,
      },
    });

    // Формируем URL для Kaspi-оплаты (deep-link / QR)
    let kaspiPayUrl: string;
    if (env.KASPI_MERCHANT_ID) {
      // Real Kaspi merchant — формат URL Kaspi.kz для оплаты по реквизитам магазина
      kaspiPayUrl = `${env.KASPI_PAY_BASE_URL}/${env.KASPI_MERCHANT_ID}?amount=${priceKzt}&reference=${ref}`;
    } else {
      // Mock-режим: ведём на /mock-payment, который ходит на /wallet/payment/:id/mock-complete
      kaspiPayUrl = `/cabinet.html#packages?mockPay=${pending.id}`;
    }

    return reply.code(201).send({
      payment: {
        id: pending.id,
        reference: ref,
        priceKzt,
        priceUsd: pkg.priceUsd,
        tokensAmount: pkg.tokens,
        kaspiPayUrl,
        expiresAt: pending.expiresAt,
        mode: env.KASPI_MERCHANT_ID ? 'live' : 'mock',
      },
    });
  });

  // ── Статус платежа (polling от фронта) ──
  app.get('/payment/:id/status', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pending = await prisma.pendingPayment.findUnique({ where: { id } });
    if (!pending) return reply.code(404).send({ error: 'Платёж не найден' });
    if (pending.userId !== req.user!.sub) return reply.code(403).send({ error: 'Нет доступа' });

    // Сразу помечаем EXPIRED, если истекло — упростит жизнь фронту
    if (pending.status === 'PENDING' && pending.expiresAt < new Date()) {
      await prisma.pendingPayment.update({ where: { id }, data: { status: 'EXPIRED' } });
      pending.status = 'EXPIRED';
    }
    return { status: pending.status, completedAt: pending.completedAt };
  });

  // ── Mock-завершение (только если KASPI_MERCHANT_ID не задан) ──
  // Используется в dev/UAT, пока нет реального merchant-аккаунта.
  // После прохождения KYC у Kaspi — заменим на webhook.
  app.post('/payment/:id/mock-complete', { preHandler: requireAuth }, async (req, reply) => {
    if (env.KASPI_MERCHANT_ID) {
      return reply.code(403).send({ error: 'Mock-режим выключен (KASPI_MERCHANT_ID задан)' });
    }
    const { id } = req.params as { id: string };
    const pending = await prisma.pendingPayment.findUnique({ where: { id } });
    if (!pending) return reply.code(404).send({ error: 'Платёж не найден' });
    if (pending.userId !== req.user!.sub) return reply.code(403).send({ error: 'Нет доступа' });
    if (pending.status !== 'PENDING') return reply.send({ status: pending.status });
    if (pending.expiresAt < new Date()) {
      await prisma.pendingPayment.update({ where: { id }, data: { status: 'EXPIRED' } });
      return reply.code(410).send({ error: 'Платёж истёк' });
    }
    await completePayment(pending.id);
    return reply.send({ status: 'COMPLETED' });
  });

  // ── Kaspi webhook (для real-режима) ──
  // Kaspi не публикует точный формат webhook'а в открытом доступе — это
  // настраивается в личном кабинете магазина. Реализую общую схему:
  // {orderId, status, amount, reference}. После подключения реального
  // мерчанта потребуется проверка подписи (HMAC) — заранее закладываем
  // X-Kaspi-Signature header.
  app.post('/payment/kaspi-webhook', async (req, reply) => {
    // ─── HMAC-проверка подписи ───
    // Без подписи любой может POST'ом на webhook отметить чужой платёж как
    // SUCCESS и получить токены. Если KASPI_API_TOKEN не задан → webhook
    // полностью отключён (mock-режим работает только через /mock-complete).
    if (!env.KASPI_API_TOKEN) {
      return reply.code(503).send({ error: 'Webhook не сконфигурирован: задайте KASPI_API_TOKEN' });
    }
    const sigHeader = (req.headers['x-kaspi-signature'] || req.headers['x-signature']) as string | undefined;
    if (!sigHeader || typeof sigHeader !== 'string') {
      return reply.code(401).send({ error: 'Missing signature header' });
    }
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expected = createHmac('sha256', env.KASPI_API_TOKEN).update(rawBody).digest('hex');
    // timingSafeEqual чтобы не утечь длиной/префиксом через timing attack
    let valid = false;
    try {
      const sigBuf = Buffer.from(sigHeader.replace(/^sha256=/i, ''), 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
    } catch { valid = false; }
    if (!valid) return reply.code(401).send({ error: 'Invalid signature' });

    const body = req.body as { reference?: string; status?: string; orderId?: string; txId?: string };
    if (!body.reference) return reply.code(400).send({ error: 'reference required' });

    const pending = await prisma.pendingPayment.findUnique({ where: { kaspiPaymentRef: body.reference } });
    if (!pending) return reply.code(404).send({ error: 'Pending payment not found' });

    if (body.status === 'SUCCESS' || body.status === 'COMPLETED' || body.status === 'PAID') {
      await prisma.pendingPayment.update({
        where: { id: pending.id },
        data: { kaspiOrderId: body.orderId || null, kaspiTxId: body.txId || null },
      });
      await completePayment(pending.id);
      return reply.send({ ok: true });
    } else if (body.status === 'FAILED' || body.status === 'CANCELED') {
      await prisma.pendingPayment.update({ where: { id: pending.id }, data: { status: 'FAILED' } });
      return reply.send({ ok: true });
    }
    return reply.send({ ok: true });
  });
}

// ─── Helper: завершить платёж и начислить токены ───
async function completePayment(pendingId: string) {
  const pending = await prisma.pendingPayment.findUnique({ where: { id: pendingId } });
  if (!pending || pending.status !== 'PENDING') return;

  const wallet = await prisma.tokenWallet.upsert({
    where: { userId: pending.userId },
    update: {},
    create: { userId: pending.userId },
  });
  const newBalance = wallet.balance + pending.tokensAmount;
  await prisma.$transaction([
    prisma.tokenWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance, totalEarned: { increment: pending.tokensAmount } },
    }),
    prisma.tokenTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'PURCHASE',
        amount: pending.tokensAmount,
        balanceAfter: newBalance,
        meta: {
          packageSize: pending.packageSize,
          priceUsd: pending.priceUsd,
          priceKzt: pending.priceKzt,
          pendingPaymentId: pending.id,
          kaspiPaymentRef: pending.kaspiPaymentRef,
        } as any,
      },
    }),
    prisma.pendingPayment.update({
      where: { id: pending.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    }),
  ]);
}
