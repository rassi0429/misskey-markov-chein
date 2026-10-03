import { shareUrl } from './share.mjs';
const $ = id => document.getElementById(id);
let currentText = '', currentHost = '', pending = false, latestState = null;
const history = [];
function message(text = '') { $('message').textContent = text; $('message').hidden = !text; }
async function api(path, body) {
  const response = await fetch(`/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '通信に失敗しました。');
  return data;
}
function clearOutput() {
  currentText = ''; currentHost = ''; history.length = 0; $('result').textContent = 'ノートを取得して、\n「生成する」を押してください。';
  $('result-meta').textContent = '未生成'; $('copy').disabled = true;
  $('history').hidden = true; $('history-items').replaceChildren();
}
function render(s) {
  latestState = s;
  $('account').hidden = !s.mode;
  $('account-name').textContent = s.user ? `${s.user.name} (@${s.user.username})` : '';
  $('account-host').textContent = s.host || '';
  $('count').textContent = s.count.toLocaleString('ja-JP');
  $('import').disabled = !s.user || s.running || s.complete || pending;
  $('import').textContent = s.scanned && !s.complete ? '続きから取得する' : 'ノートを取得する';
  $('stop').hidden = !s.running; $('activity').hidden = !s.running;
  $('forget').hidden = !s.mode && !s.host;
  $('generate').disabled = !s.count || pending;
  $('login').disabled = pending || s.running;
  const canShare = Boolean(currentHost && currentText && !pending);
  $('share').setAttribute('aria-disabled', String(!canShare));
  $('share').tabIndex = canShare ? 0 : -1;
  if (canShare) $('share').href = shareUrl(currentHost, currentText);
  else $('share').removeAttribute('href');
  $('post-target').textContent = s.host ? `投稿画面：${s.host}。Misskeyでログイン中のアカウントから投稿します。` : '本文を生成すると、投稿画面を新しいタブで開けます。';
  $('forget').disabled = pending; $('stop').disabled = pending;
  $('progress-text').textContent = s.running ? `${s.scanned.toLocaleString()}件確認済み。古いノートを取得中…` :
    s.error ? s.error : s.complete ? `取得完了。${s.scanned.toLocaleString()}件確認、公開の本文${s.count.toLocaleString()}件。` :
    s.scanned ? '中断しました。続きから再開できます。' : s.user ? '連携済み。ノートを取得してください。' : 'Misskeyと連携してください。';
}
async function action(callback) {
  if (pending) return;
  pending = true; message(); if (latestState) render(latestState);
  try { await callback(); } catch (error) { message(error.message); }
  finally { pending = false; try { render(await api('state')); } catch (error) { message(error.message); } }
}
$('login-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => {
  const data = await api('login', { host: $('host').value.trim() }); location.assign(data.url);
}); });
$('import').addEventListener('click', () => action(async () => { await api('import', {}); }));
$('stop').addEventListener('click', () => action(async () => { await api('stop', {}); }));
$('forget').addEventListener('click', () => action(async () => { await api('forget', {}); clearOutput(); }));
$('generate').addEventListener('click', () => action(async () => {
  const data = await api('generate', { order: Number($('order').value), length: Number($('length').value) });
  const { text } = data;
  if (currentText) { history.unshift({ text: currentText, host: currentHost }); history.length = Math.min(history.length, 5); }
  currentHost = latestState.host;
  currentText = text; $('result').textContent = text; $('result-meta').textContent = `${Array.from(text).length}字`; $('copy').disabled = false;
  $('history-items').replaceChildren(...history.map(({ text, host }, index) => {
    const item = document.createElement('article'); item.className = 'history-item';
    const p = document.createElement('p'); p.textContent = text;
    const link = document.createElement('a'); link.className = 'text-button history-post';
    link.textContent = '投稿 ↗'; link.href = shareUrl(host, text);
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `履歴${index + 1}の投稿画面を開く`);
    link.title = `${host}の投稿画面を新しいタブで開く`;
    item.append(p, link); return item;
  }));
  $('history').hidden = !history.length;
}));
$('share').addEventListener('click', event => {
  if ($('share').getAttribute('aria-disabled') === 'true') event.preventDefault();
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentText); $('copy').textContent = 'コピー済み'; setTimeout(() => { $('copy').textContent = 'コピー'; }, 1500); }
  catch { message('コピーできませんでした。文章を選択してコピーしてください。'); }
});
async function poll() {
  try { if (!pending) render(await api('state')); } catch (error) { message(`サーバーに接続できません。${error.message}`); }
  finally { setTimeout(poll, 1200); }
}
void poll();
