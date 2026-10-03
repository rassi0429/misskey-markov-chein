import https from 'node:https';
import dns from 'node:dns';
import { isIP } from 'node:net';

export function normalizeHost(value) {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || isIP(url.hostname) || !url.hostname.includes('.')) {
    throw new Error('公開Misskeyサーバーのドメイン名を入力してください。');
  }
  return url.hostname;
}
export function publicIPv4(address) {
  const [a, b] = address.split('.').map(Number);
  return isIP(address) === 4 && ![0, 10, 127].includes(a) && a < 224 &&
    !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && [18, 19].includes(b));
}
export function remote(host, path, body, signal) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname: host, path, method: 'POST', signal,
      lookup(name, options, callback) {
        dns.lookup(name, { family: 4 }, (error, address, family) => {
          if (error) return callback(error);
          if (!publicIPv4(address)) return callback(new Error('公開サーバーにだけ接続できます。'));
          callback(null, options.all ? [{ address, family }] : address, family);
        });
      },
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'misskey-markov-chein/0.1' },
    }, res => {
      let response = '', size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 8_000_000) { req.destroy(new Error('サーバーの応答が大きすぎます。')); return; }
        response += chunk;
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`Misskey APIがエラーを返しました (${res.statusCode})。時間をおいて再開してください。`);
          error.status = res.statusCode;
          return reject(error);
        }
        try { resolve(JSON.parse(response)); } catch { reject(new Error('Misskey APIの応答を読み取れませんでした。')); }
      });
    });
    req.setTimeout(25_000, () => req.destroy(new Error('Misskeyへの接続がタイムアウトしました。')));
    req.on('error', reject);
    req.end(data);
  });
}
