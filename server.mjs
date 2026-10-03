import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Markov } from './markov.mjs';
import { remote, normalizeHost } from './remote.mjs';
import { loadConfig } from './config.mjs';

const { port, host, origin, authority, secure } = loadConfig();
const sessions = new Map();
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/share.mjs', ['share.mjs', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
function json(res, body, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function state(s) {
  return { user: s.user ? { name: s.user.name || s.user.username, username: s.user.username } : null,
    host: s.host, mode: s.mode, count: s.texts.length, scanned: s.scanned,
    running: s.running, complete: s.complete, error: s.error };
}
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16_384) throw new Error('リクエストが大きすぎます。'); }
  return JSON.parse(data || '{}');
}
function reset(s) {
  s.abort?.abort();
  Object.assign(s, { token: null, user: null, host: null, auth: null, texts: [], scanned: 0,
    cursor: null, seen: new Set(), models: new Map(), running: false, complete: false,
    error: null, mode: null, abort: null });
}
export async function collect(s, controller, request = remote) {
  try {
    while (!controller.signal.aborted) {
      const notes = await request(s.host, '/api/users/notes', {
        userId: s.user.id, limit: 100, withReplies: true,
        withRenotes: false, withChannelNotes: true, ...(s.cursor ? { untilId: s.cursor } : {}),
      }, controller.signal);
      if (controller.signal.aborted || s.abort !== controller) break;
      if (!Array.isArray(notes)) throw new Error('ノート一覧を読み取れませんでした。');
      if (!notes.length) { s.complete = true; break; }
      const cursor = notes.at(-1).id;
      if (!cursor || cursor === s.cursor) throw new Error('取得位置が進みませんでした。');
      for (const note of notes) {
        if (s.seen.has(note.id)) continue;
        s.seen.add(note.id); s.scanned++;
        if (note.userId !== s.user.id || !note.text || !note.text.trim()) continue;
        if (note.visibility !== 'public') continue;
        s.texts.push(note.text);
      }
      s.models.clear(); s.cursor = cursor;
    }
  } catch (error) { if (!controller.signal.aborted) s.error = error.message; }
  finally { if (s.abort === controller) s.running = false; }
}
export const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    if (req.method === 'GET' && req.url === '/healthz') return json(res, { ok: true });
    if (req.headers.host !== authority) return json(res, { error: `${origin} を開いてください。` }, 403);
    const url = new URL(req.url, origin);
    if (!['GET', 'POST'].includes(req.method)) return json(res, { error: 'Method not allowed' }, 405);
    if (req.method === 'POST' && req.headers.origin !== origin) return json(res, { error: 'Origin mismatch' }, 403);
    let id = /(?:^|;\s*)mmc=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    let s = sessions.get(id);
    if (!s) {
      id = randomUUID(); s = {}; reset(s); sessions.set(id, s);
      res.setHeader('Set-Cookie', `mmc=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure ? '; Secure' : ''}`);
    }
    s.touched = Date.now();
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, type] = assets.get(url.pathname);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
    }
    if (req.method === 'GET' && url.pathname === '/callback') {
      const auth = s.auth;
      if (!auth || url.searchParams.get('session') !== auth.id || Date.now() - auth.created > 600_000) throw new Error('認証が期限切れです。もう一度連携してください。');
      s.auth = null;
      const result = await remote(s.host, `/api/miauth/${auth.id}/check`, {});
      if (!result.ok || !result.token || !result.user?.id) throw new Error('連携が許可されていません。もう一度連携してください。');
      s.token = result.token; s.user = result.user; s.mode = 'misskey';
      res.writeHead(302, { Location: '/' }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, state(s));
    if (req.method !== 'POST') return json(res, { error: 'ページが見つかりません。' }, 404);
    const input = await body(req);
    if (url.pathname === '/api/login') {
      const host = normalizeHost(String(input.host || ''));
      // Verify a reachable public Misskey API before sending the browser there.
      await remote(host, '/api/meta', { detail: false });
      reset(s); s.host = host; s.auth = { id: randomUUID(), created: Date.now() };
      const params = new URLSearchParams({ name: 'Misskey Markov', callback: `${origin}/callback`, permission: 'read:account' });
      return json(res, { url: `https://${host}/miauth/${s.auth.id}?${params}` });
    }
    if (url.pathname === '/api/forget') { reset(s); return json(res, state(s)); }
    if (url.pathname === '/api/stop') { s.abort?.abort(); s.running = false; return json(res, state(s)); }
    if (url.pathname === '/api/import') {
      if (!s.token) throw new Error('先にMisskeyと連携してください。');
      if (s.running) return json(res, state(s));
      s.error = null;
      if (!s.complete) { s.running = true; s.abort = new AbortController(); void collect(s, s.abort); }
      return json(res, state(s));
    }
    if (url.pathname === '/api/generate') {
      if (!s.texts.length) throw new Error('先にMisskeyと連携し、ノートを取得してください。');
      const order = Number(input.order || 2), length = Number(input.length || 140);
      if (![1, 2, 3].includes(order) || !Number.isInteger(length) || length < 30 || length > 500) throw new Error('生成設定を確認してください。');
      if (!s.models.has(order)) s.models.set(order, new Markov(s.texts, order));
      const text = s.models.get(order).generate(length);
      return json(res, { text });
    }
    return json(res, { error: 'APIが見つかりません。' }, 404);
  } catch (error) { if (!res.headersSent) json(res, { error: error.message }, 400); else res.end(); }
});
setInterval(() => {
  for (const [id, s] of sessions) if (Date.now() - s.touched > 24 * 3600_000) { reset(s); sessions.delete(id); }
}, 60_000).unref();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, host, () => console.log(`Misskey Markov: ${origin} (listen ${host}:${port})`));
  const shutdown = () => {
    for (const session of sessions.values()) session.abort?.abort();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
