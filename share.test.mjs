import test from 'node:test';
import assert from 'node:assert/strict';
import { shareUrl } from './public/share.mjs';

test('share form URL preserves the generated text and appends the hashtag followed by the site URL', () => {
  const text = '今日は :resonite: で遊ぶ！\n猫 & コーヒー #好き? 🍵';
  const url = new URL(shareUrl('misskey.resonite.love', text));
  assert.equal(url.origin, 'https://misskey.resonite.love');
  assert.equal(url.pathname, '/share');
  assert.equal(url.searchParams.get('text'), `${text}\n\n#マルコフ連鎖\nhttps://markov.kokoa.dev/`);
  assert.equal([...url.searchParams].length, 1);
});
