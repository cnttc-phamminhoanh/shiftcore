// Rate limit đơn giản trong bộ nhớ (theo IP) — chống quét API / quá tải.
import { config } from '../config.js';

const hits = new Map();

export function rateLimit(req, res, next) {
  const ip = req.clientIp || 'unknown';
  const now = Date.now();
  const win = config.rateLimitWindowMs;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  if (arr.length >= config.rateLimitMax) {
    res.status(429).json({ error: 'Quá nhiều yêu cầu, xin thử lại sau' });
    return;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 10000) {
    for (const [k, v] of hits) {
      if (now - v[v.length - 1] > win) hits.delete(k);
    }
  }
  next();
}
