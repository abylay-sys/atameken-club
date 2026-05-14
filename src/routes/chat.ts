import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { verifyAccessToken } from '../lib/jwt';
import { translateToMany, normalizeLang, SUPPORTED_LANGS, type Lang } from '../services/translation';

const createConvSchema = z.object({
  // Минимум один из: peerUserId или publicationId (которые открывает чат с автором публикации)
  peerUserId: z.string().optional(),
  publicationId: z.string().optional(),
  initialText: z.string().min(1).max(4000).optional(),
});

const sendSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1).max(4000),
  lang: z.string().optional(),
});

// Реестр подключённых WebSocket'ов — userId → Set<WebSocket>
const wsClients = new Map<string, Set<any>>();

function broadcastToUser(userId: string, payload: unknown) {
  const sockets = wsClients.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(payload);
  for (const ws of sockets) {
    try { ws.send(msg); } catch { /* ignore */ }
  }
}

async function ensureParticipant(conversationId: string, userId: string) {
  const found = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!found) {
    const err: any = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }
  return found;
}

export default async function chatRoutes(app: FastifyInstance) {
  await app.register(websocket);

  // ── Создание / поиск разговора с peer-юзером ──
  app.post('/conversations', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createConvSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const { peerUserId, publicationId, initialText } = parsed.data;

    // Определяем peer: либо явно передан, либо из автора публикации
    let peerId = peerUserId;
    if (!peerId && publicationId) {
      const pub = await prisma.publication.findUnique({ where: { id: publicationId } });
      if (!pub) return reply.code(404).send({ error: 'Публикация не найдена' });
      peerId = pub.userId;
    }
    if (!peerId) return reply.code(400).send({ error: 'Укажите peerUserId или publicationId' });
    if (peerId === req.user!.sub) return reply.code(400).send({ error: 'Нельзя начать чат с самим собой' });

    // Ищем существующий чат 1-на-1 между этими двумя
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: req.user!.sub } } },
          { participants: { some: { userId: peerId } } },
        ],
      },
      include: { participants: true },
    });
    let conv = existing;
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          publicationId: publicationId || null,
          participants: {
            create: [
              { userId: req.user!.sub, preferredLang: 'ru' },
              { userId: peerId, preferredLang: 'ru' },
            ],
          },
        },
        include: { participants: true },
      });
    }

    // Если передан initialText — сразу шлём первое сообщение
    if (initialText) {
      await sendAndBroadcast(conv.id, req.user!.sub, initialText, 'ru');
    }

    return reply.code(201).send({ conversation: conv });
  });

  // ── Мои разговоры (последние сообщения + непрочитанные) ──
  app.get('/conversations', { preHandler: requireAuth }, async (req) => {
    const myParts = await prisma.conversationParticipant.findMany({
      where: { userId: req.user!.sub },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, email: true, fullName: true, profile: { select: { companyName: true } } } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    const items = await Promise.all(
      myParts.map(async (part) => {
        const conv = part.conversation;
        const peer = conv.participants.find((p) => p.userId !== req.user!.sub);
        const lastMsg = conv.messages[0] || null;
        const unread = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: req.user!.sub },
            createdAt: part.lastReadAt ? { gt: part.lastReadAt } : undefined,
          },
        });
        return {
          id: conv.id,
          publicationId: conv.publicationId,
          lastMessageAt: conv.lastMessageAt,
          unread,
          preferredLang: part.preferredLang,
          peer: peer
            ? {
                userId: peer.userId,
                preferredLang: peer.preferredLang,
                fullName: peer.user.fullName || peer.user.profile?.companyName || peer.user.email,
                email: peer.user.email,
              }
            : null,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                originalText: lastMsg.originalText,
                originalLang: lastMsg.originalLang,
                translations: lastMsg.translations,
                senderId: lastMsg.senderId,
                createdAt: lastMsg.createdAt,
              }
            : null,
        };
      }),
    );
    return { items };
  });

  // ── История сообщений одной переписки ──
  app.get('/conversations/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ensureParticipant(id, req.user!.sub);
    } catch {
      return reply.code(403).send({ error: 'Нет доступа' });
    }
    const items = await prisma.message.findMany({
      where: { conversationId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    // Помечаем прочитанным
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.sub } },
      data: { lastReadAt: new Date() },
    });
    return { items };
  });

  // ── Отправка сообщения по REST (фронт без WS-fallback) ──
  app.post('/messages', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    try {
      await ensureParticipant(parsed.data.conversationId, req.user!.sub);
    } catch {
      return reply.code(403).send({ error: 'Нет доступа к переписке' });
    }
    const lang = normalizeLang(parsed.data.lang);
    const msg = await sendAndBroadcast(parsed.data.conversationId, req.user!.sub, parsed.data.text, lang);
    return reply.code(201).send({ message: msg });
  });

  // ── Сменить язык, на который переводить входящие сообщения ──
  app.put('/conversations/:id/lang', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { lang?: string };
    const lang = normalizeLang(body.lang);
    try {
      await ensureParticipant(id, req.user!.sub);
    } catch {
      return reply.code(403).send({ error: 'Нет доступа' });
    }
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.sub } },
      data: { preferredLang: lang },
    });
    return { preferredLang: lang };
  });

  // ── WebSocket: real-time push новых сообщений ──
  // Подключение: GET /chat/ws?token={accessToken}
  app.get('/ws', { websocket: true }, (connection: any, req: any) => {
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token') || '';
    let sub: string | null = null;
    try {
      sub = verifyAccessToken(token).sub;
    } catch {
      try { connection.socket.send(JSON.stringify({ type: 'error', error: 'unauthorized' })); } catch {}
      connection.socket.close();
      return;
    }
    if (!sub) return;

    // Регистрация в реестре
    if (!wsClients.has(sub)) wsClients.set(sub, new Set());
    wsClients.get(sub)!.add(connection.socket);

    try { connection.socket.send(JSON.stringify({ type: 'connected', userId: sub })); } catch {}

    // Поддерживаем входящие команды (отправка сообщения через WS)
    connection.socket.on('message', async (raw: any) => {
      try {
        const data = JSON.parse(String(raw));
        if (data.type === 'send') {
          const parsed = sendSchema.safeParse(data);
          if (!parsed.success) {
            connection.socket.send(JSON.stringify({ type: 'error', error: 'Invalid send payload' }));
            return;
          }
          // Проверяем участие
          try { await ensureParticipant(parsed.data.conversationId, sub!); }
          catch { connection.socket.send(JSON.stringify({ type: 'error', error: 'Нет доступа' })); return; }
          const lang = normalizeLang(parsed.data.lang);
          await sendAndBroadcast(parsed.data.conversationId, sub!, parsed.data.text, lang);
        } else if (data.type === 'ping') {
          connection.socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch (e) {
        try { connection.socket.send(JSON.stringify({ type: 'error', error: 'Bad frame' })); } catch {}
      }
    });

    connection.socket.on('close', () => {
      const set = wsClients.get(sub!);
      if (set) {
        set.delete(connection.socket);
        if (set.size === 0) wsClients.delete(sub!);
      }
    });
  });
}

// ─── Помощник: сохранить сообщение в БД, перевести и разослать участникам ───
async function sendAndBroadcast(
  conversationId: string,
  senderId: string,
  text: string,
  origLang: Lang,
) {
  // Список участников и их preferredLang (мы переведём на все языки, отличные от origLang)
  const parts = await prisma.conversationParticipant.findMany({ where: { conversationId } });
  const targetLangs = Array.from(
    new Set(
      parts
        .filter((p) => p.userId !== senderId)
        .map((p) => normalizeLang(p.preferredLang))
        .filter((l) => l !== origLang),
    ),
  );

  // Параллельно: переводим (если есть кому) + создаём сообщение в БД
  const translations = targetLangs.length ? await translateToMany(text, origLang, targetLangs) : {};

  const msg = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      originalText: text,
      originalLang: origLang,
      translations: Object.keys(translations).length ? (translations as any) : undefined,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: msg.createdAt },
  });

  // Push через WS всем участникам (включая отправителя — синхронизирует другие вкладки)
  const payload = {
    type: 'message',
    message: {
      id: msg.id,
      conversationId,
      senderId,
      originalText: text,
      originalLang: origLang,
      translations: translations || {},
      createdAt: msg.createdAt,
    },
  };
  for (const p of parts) broadcastToUser(p.userId, payload);

  return msg;
}

// Re-export для других сервисов, если потребуется (например, тестам)
export { SUPPORTED_LANGS };
