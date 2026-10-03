import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { server, collect } from './server.mjs';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: { get: name => {
        const value = res.headers[name]; return Array.isArray(value) ? value[0] : value;
      } }, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject); req.end(options.body);
  });
}

test('session isolation, generation, deletion and request protections', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Host: 'localhost:3210', Origin: 'http://localhost:3210', 'Content-Type': 'application/json' };
  try {
    const state = await request(`${base}/api/state`, { headers });
    assert.equal(state.status, 200);
    const cookie = state.headers.get('set-cookie').split(';')[0];
    assert.equal((await state.json()).count, 0);
    const own = { ...headers, Cookie: cookie };
    const generated = await request(`${base}/api/generate`, { method: 'POST', headers: own, body: JSON.stringify({ order: 1, length: 140 }) });
    assert.equal(generated.status, 400);
    const removedDemo = await request(`${base}/api/demo`, { method: 'POST', headers: own, body: '{}' });
    assert.equal(removedDemo.status, 404);
    const stranger = await request(`${base}/api/state`, { headers });
    assert.equal((await stranger.json()).count, 0);
    const csrf = await request(`${base}/api/forget`, { method: 'POST', headers: { ...own, Origin: 'https://example.com' }, body: '{}' });
    assert.equal(csrf.status, 403);
    const callback = await request(`${base}/callback?session=wrong`, { headers: own });
    assert.equal(callback.status, 400);
    const forget = await request(`${base}/api/forget`, { method: 'POST', headers: own, body: '{}' });
    assert.equal((await forget.json()).count, 0);
    const host = await request(`${base}/api/state`);
    assert.equal(host.status, 403);
    const page = await request(`${base}/`, { headers });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const module = await request(`${base}/share.mjs`, { headers });
    assert.equal(module.status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('note collection paginates, filters author and visibility, deduplicates and resumes', async () => {
  const abort = new AbortController();
  const s = { host: 'example.com', token: 'test-only', user: { id: 'self' }, abort, cursor: null,
    seen: new Set(), texts: [], models: new Map(), scanned: 0, running: true };
  const pages = [
    [{ id: '9', userId: 'self', visibility: 'public', text: '公開ノート' },
      { id: '8', userId: 'self', visibility: 'followers', text: '秘密の文章' },
      { id: '7', userId: 'other', visibility: 'public', text: '他人の文章' },
      { id: '6', userId: 'self', visibility: 'home', text: null }],
    [{ id: '9', userId: 'self', visibility: 'public', text: '公開ノート' },
      { id: '5', userId: 'self', visibility: 'home', text: 'ホームノート' },
      { id: '4', userId: 'self', visibility: 'specified', text: 'ダイレクトノート' }],
  ];
  const cursors = [];
  await collect(s, abort, async (_host, _path, params) => {
    cursors.push(params.untilId);
    assert.equal(params.i, undefined);
    if (!pages.length) throw new Error('一時的な接続エラー');
    return pages.shift();
  });
  assert.deepEqual(cursors, [undefined, '6', '4']);
  assert.deepEqual(s.texts, ['公開ノート']);
  assert.equal(s.scanned, 6);
  assert.equal(s.cursor, '4'); assert.equal(s.running, false);
  assert.match(s.error, /接続エラー/);
  const resumed = new AbortController(); s.abort = resumed; s.running = true; s.error = null;
  await collect(s, resumed, async (_host, _path, params) => { assert.equal(params.untilId, '4'); return []; });
  assert.equal(s.complete, true);
});

test('late response after cancellation does not restore deleted data', async () => {
  const abort = new AbortController();
  const s = { host: 'example.com', token: 'test-only', user: { id: 'self' }, abort,
    texts: [], cursor: null, running: true };
  await collect(s, abort, async () => {
    abort.abort(); s.abort = null; s.user = null;
    return [{ id: '1', userId: 'self', visibility: 'public', text: '削除後に残さない' }];
  });
  assert.deepEqual(s.texts, []);
});
