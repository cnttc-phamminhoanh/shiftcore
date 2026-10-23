// IP allowlist theo dải CIDR — cho phép cả DẢI mạng nội bộ (IP máy đổi vẫn
// truy cập được), chặn máy ngoài công ty. Cấu hình qua ALLOW_CIDRS.
import { config } from '../config.js';

function ipv4Int(ip) {
  const p = ip.split('.').map(Number);
  return (((p[0] & 255) << 24) | ((p[1] & 255) << 16) | ((p[2] & 255) << 8) | (p[3] & 255)) >>> 0;
}

function normalizeIp(ip) {
  if (ip && ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function cidrMatch(ip, cidr) {
  const normalized = normalizeIp(ip);
  if (normalized === '::1' || normalized === '127.0.0.1') {
    return cidr === '::1/128' || cidr.startsWith('::1') || cidr.startsWith('127.0.0.1');
  }
  if (normalized.includes(':')) return cidr.includes(':');
  const slash = cidr.indexOf('/');
  const cip = slash === -1 ? cidr : cidr.slice(0, slash);
  const bits = slash === -1 ? 32 : Number(cidr.slice(slash + 1));
  if (!cip.includes('.')) return false;
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : ((1 << bits) - 1) << (32 - bits);
  return (ipv4Int(normalized) & mask) === (ipv4Int(cip) & mask);
}

export function isAllowed(ip) {
  const normalized = normalizeIp(ip || '');
  if (!normalized) return false;
  if (config.allowCidrs.length === 0) return true; // không giới hạn (đã cảnh báo ở README)
  return config.allowCidrs.some((c) => cidrMatch(normalized, c));
}

export function allowlist(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || '';
  if (!isAllowed(ip)) {
    res.status(403).json({ error: 'Truy cập bị từ chối (ngoài dải IP cho phép)' });
    return;
  }
  req.clientIp = normalizeIp(ip);
  next();
}
