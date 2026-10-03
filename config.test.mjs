import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.mjs';

test('development defaults and container public URL configuration', () => {
  assert.deepEqual(loadConfig({}), { port: 3210, host: '127.0.0.1', origin: 'http://localhost:3210', authority: 'localhost:3210', secure: false });
  assert.deepEqual(loadConfig({ PORT: '8080', HOST: '0.0.0.0', PUBLIC_URL: 'https://markov.example.com/' }), {
    port: 8080, host: '0.0.0.0', origin: 'https://markov.example.com', authority: 'markov.example.com', secure: true,
  });
});
test('reject malformed ports and public URL settings', () => {
  for (const PORT of ['0', '-1', '65536', 'abc', '1.5']) assert.throws(() => loadConfig({ PORT }));
  for (const PUBLIC_URL of ['http://markov.example.com', 'https://example.com/path', 'https://u:p@example.com', 'https://example.com/?token=secret', 'https://example.com/#hash']) {
    assert.throws(() => loadConfig({ PUBLIC_URL }));
  }
});
