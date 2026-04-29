import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notifyCartOrder } from '../services/telegram';

const cartItemSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
});

const cartSchema = z.object({
  name: z.string().min(1).max(200),
  contact: z.string().min(3).max(200),
  comment: z.string().max(2000).optional().nullable(),
  items: z.array(cartItemSchema).min(1).max(50),
});

export default async function servicesRoutes(app: FastifyInstance) {
  app.post('/cart-submit', async (req, reply) => {
    const parsed = cartSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid cart payload', details: parsed.error.format() });
    }
    const data = parsed.data;
    // fire-and-forget telegram notification
    notifyCartOrder({
      name: data.name,
      contact: data.contact,
      comment: data.comment ?? undefined,
      items: data.items,
    }).catch((err) => {
      req.log.error({ err }, 'cart-submit telegram notify failed');
    });
    return reply.send({ ok: true });
  });
}
