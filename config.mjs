export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const url = new URL(env.PUBLIC_URL || `http://localhost:${port}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_URL must be an HTTP(S) origin without a path, query or credentials.');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('PUBLIC_URL must use HTTPS for a public domain.');
  }
  return { port, host: env.HOST || '127.0.0.1', origin: url.origin, authority: url.host, secure: url.protocol === 'https:' };
}
