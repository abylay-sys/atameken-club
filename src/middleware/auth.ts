import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type AccessPayload } from '../lib/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.user = verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}
