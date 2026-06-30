import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '@/config/env';
import { AuthTokenPayload } from '@/types';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: AuthTokenPayload): string {
  const options: SignOptions = { expiresIn: config.jwt.accessTtl as SignOptions['expiresIn'] };
  return jwt.sign(payload, config.jwt.accessSecret, options);
}

export function signRefreshToken(payload: AuthTokenPayload): string {
  const options: SignOptions = { expiresIn: config.jwt.refreshTtl as SignOptions['expiresIn'] };
  return jwt.sign(payload, config.jwt.refreshSecret, options);
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as AuthTokenPayload;
}