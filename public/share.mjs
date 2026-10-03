export function shareUrl(host, text) {
  const url = new URL(`https://${host}/share`);
  url.searchParams.set('text', `${text}\n\n#マルコフ連鎖`);
  return url.href;
}
