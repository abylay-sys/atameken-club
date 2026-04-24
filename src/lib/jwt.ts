import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from './env';

export type AccessPayload = {
  sub: string;
  role: string;
  email: string;
};

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function refreshExpiryDate(): Date {
  const ttl = env.JWT_REFRESH_TTL;
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  const n = Number(match[1]);
  const unit = match[2];
  const ms =
    unit === 's' ? n * 1000 :
    unit === 'm' ? n * 60 * 1000 :
    unit === 'h' ? n * 60 * 60 * 1000 :
    n * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}
