import { Redis } from '@upstash/redis';

// Upstash Redis when its env vars are present (the Vercel integration adds them). Off Vercel (dev server,
// smoke test) an in-memory stand-in with the same few commands, so the API runs with no setup.
export function openStore() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new Redis({ url, token, enableAutoPipelining: true });
  return process.env.VERCEL ? null : memory;
}

const mem = new Map();
const list = k => mem.get(k) || [];
const memory = {
  async hgetall(k) { const h = mem.get(k); return h ? structuredClone(Object.fromEntries(h)) : null; },
  async hsetnx(k, f, v) {
    if (!mem.has(k)) mem.set(k, new Map());
    const h = mem.get(k);
    if (h.has(f)) return 0;
    h.set(f, structuredClone(v));
    return 1;
  },
  async hlen(k) { return mem.get(k)?.size || 0; },
  async hdel(k, ...fs) { const h = mem.get(k); let n = 0; for (const f of fs) n += h?.delete(f) ? 1 : 0; return n; },
  async del(k) { return mem.delete(k) ? 1 : 0; },
  async expire() { return 1; },
  async lpush(k, v) { mem.set(k, [v, ...list(k)]); return list(k).length; },
  async ltrim(k, a, b) { mem.set(k, list(k).slice(a, b + 1)); return 'OK'; },
  async lrange(k, a, b) { return list(k).slice(a, b + 1); },
};
