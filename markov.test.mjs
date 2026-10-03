import test from 'node:test';
import assert from 'node:assert/strict';
import { Markov, tokenize, clean } from './markov.mjs';
import { normalizeHost, publicIPv4 } from './remote.mjs';

test('Japanese tokenization preserves whitespace and custom emoji', () => {
  const text = '今日は :resonite: で遊ぶ。\nまた明日！';
  const tokens = tokenize(text);
  assert.equal(tokens.join(''), text);
  assert.ok(tokens.includes(':resonite:'));
});
test('URLs and mentions are not learned', () => {
  assert.equal(clean('@friend@example.com 今日は晴れ https://example.com/a'), '今日は晴れ');
});
test('generation recombines corpus and respects character limit', () => {
  const texts = ['今日は猫と遊んできた。とても楽しかった。', '今日は友達と遊んできた。気づいたら朝だった。', '昨日は猫と寝ていた。気づいたら朝だった。'];
  const model = new Markov(texts, 1);
  let seed = 17;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 20; i++) {
    const text = model.generate(50, random);
    assert.ok(!model.originals.has(text));
    assert.ok(Array.from(text).length <= 50);
    assert.ok(Array.from(text).length >= 8);
  }
});
test('insufficient corpus does not echo a source note', () => {
  assert.throws(() => new Markov(['あいうえおかきくけこ'], 3).generate(140), /ノートを増やす/);
});
test('remote host must be a plain HTTPS public domain', () => {
  assert.equal(normalizeHost('misskey.resonite.love'), 'misskey.resonite.love');
  for (const host of ['localhost', '127.0.0.1', 'http://example.com', 'https://u:p@example.com', 'example.com/path', 'example.com:4430']) assert.throws(() => normalizeHost(host));
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1']) assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4('1.1.1.1'), true);
});
