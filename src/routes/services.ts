import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalAuth } from '../middleware/auth';
import { notifyCartOrder } from '../services/telegram';

const cartItemSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
});

const cartSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  contact: z.string().max(200).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  items: z.array(cartItemSchema).min(1).max(50),
});

export default async function servicesRoutes(app: FastifyInstance) {
  app.post('/cart-submit', { preHandler: optionalAuth }, async (req, reply) => {
    const parsed = cartSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid cart payload', details: parsed.error.format() });
    }
    const data = parsed.data;

    // If authenticated, enrich with user/profile info
    let userInfo: { id?: string; email?: string; fullName?: string; phone?: string; companyName?: string | null } = {};
    if (req.user?.sub) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          profile: { select: { companyName: true, contactPhone: true, contactEmail: true } },
        },
      });
      if (user) {
        userInfo = {
          id: user.id,
          email: user.email,
          fullName: user.fullName ?? undefined,
          phone: user.profile?.contactPhone ?? user.phone ?? undefined,
          companyName: user.profile?.companyName ?? null,
        };
      }
    }

    // Resolve final name/contact: prefer authed user, fallback to form fields
    const name =
      userInfo.fullName ||
      userInfo.email ||
      (data.name ?? '').trim() ||
      null;
    const contact =
      userInfo.email ||
      (data.contact ?? '').trim() ||
      null;

    if (!name || !contact) {
      return reply.code(400).send({ error: 'Укажите имя и контакт' });
    }

    // Fire-and-forget Telegram notification
    notifyCartOrder({
      name,
      contact,
      comment: data.comment ?? undefined,
      items: data.items,
      userId: userInfo.id,
      companyName: userInfo.companyName ?? undefined,
      phone: userInfo.phone,
    }).catch((err) => {
      req.log.error({ err }, 'cart-submit telegram notify failed');
    });

    return reply.send({ ok: true });
  });
}
