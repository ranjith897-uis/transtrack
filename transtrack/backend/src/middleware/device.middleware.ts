import { Request, Response, NextFunction } from 'express';
import { config } from '@/config/env';

/**
 * GPS hardware devices (and the simulator standing in for them today)
 * don't have user accounts — they authenticate with a shared device key
 * instead of a JWT. Swap this for per-device API keys once real hardware
 * is procured, if you want per-device revocation.
 */
export function requireDeviceKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-device-key'];
  if (key !== config.deviceIngestKey) {
    return res.status(401).json({ error: 'Invalid device ingestion key' });
  }
  next();
}
