const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
export function tokenize(text) {
  return text.split(/(:[a-zA-Z0-9_]+:)/g).flatMap(part => /^:[a-zA-Z0-9_]+:$/.test(part)
    ? [part] : [...segmenter.segment(part)].map(s => s.segment));
}
export function clean(text) {
  return text.replace(/https?:\/\/\S+/g, '').replace(/@[\w.-]+(?:@[\w.-]+)?/g, '')
    .replace(/\$\[[^\s\]]+\s([^\]]*)\]/g, '$1').trim();
}
export class Markov {
  constructor(texts, order = 2) {
    this.order = order;
    this.originals = new Set(texts.map(clean).filter(Boolean));
    this.transitions = new Map();
    for (const text of this.originals) {
      const words = [...Array(order).fill(null), ...tokenize(text), null];
      for (let i = order; i < words.length; i++) {
        const key = JSON.stringify(words.slice(i - order, i));
        if (!this.transitions.has(key)) this.transitions.set(key, []);
        this.transitions.get(key).push(words[i]);
      }
    }
  }
  generate(maxLength = 140, random = Math.random) {
    for (let attempt = 0; attempt < 250; attempt++) {
      let state = Array(this.order).fill(null), output = '';
      for (let step = 0; step < 400; step++) {
        const options = this.transitions.get(JSON.stringify(state));
        if (!options?.length) break;
        const next = options[Math.floor(random() * options.length)];
        if (next === null) break;
        if (Array.from(output + next).length > maxLength) break;
        output += next;
        state = [...state.slice(1), next];
      }
      output = output.trim();
      if (Array.from(output).length >= 8 && !this.originals.has(output)) return output;
    }
    throw new Error('新しい文章を作れませんでした。ノートを増やすか、まとまり具合を下げてください。');
  }
}
