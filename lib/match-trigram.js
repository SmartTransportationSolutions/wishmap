// Character-trigram similarity. Works across Georgian case endings
// (ანგარიში / ანგარიშის / ანგარიშები share most trigrams) without a stemmer.

export const DEFAULT_THRESHOLD = 0.3;

export function normalize(text) {
  return String(text ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
}

function trigramCounts(text) {
  const counts = new Map();
  for (const word of normalize(text).split(" ")) {
    if (!word) continue;
    const padded = Array.from(` ${word} `);
    for (let i = 0; i + 3 <= padded.length; i++) {
      const tri = padded.slice(i, i + 3).join("");
      counts.set(tri, (counts.get(tri) || 0) + 1);
    }
  }
  return counts;
}

export function similarity(a, b) {
  const ca = trigramCounts(a);
  const cb = trigramCounts(b);
  if (ca.size === 0 || cb.size === 0) return 0;
  let dot = 0;
  for (const [t, n] of ca) dot += n * (cb.get(t) || 0);
  const norm = (m) => Math.sqrt([...m.values()].reduce((s, n) => s + n * n, 0));
  return dot / (norm(ca) * norm(cb));
}

export function sharedStems(a, b) {
  const wordsB = normalize(b).split(" ").filter(Boolean);
  const out = [];
  for (const w of normalize(a).split(" ")) {
    const letters = Array.from(w);
    if (letters.length < 4) continue;
    const stem = letters.slice(0, Math.min(5, letters.length)).join("");
    if (!out.includes(stem) && wordsB.some((x) => x.startsWith(stem))) out.push(stem);
    if (out.length === 3) break;
  }
  return out;
}

export function findRelated(wish, candidates, { threshold = DEFAULT_THRESHOLD, limit = 3, exclude = new Set() } = {}) {
  return candidates
    .filter((c) => c.n !== wish.n && !exclude.has(c.n))
    .map((c) => ({ n: c.n, score: similarity(wish.text, c.text), text: c.text }))
    .filter((r) => r.score >= threshold)
    .sort((x, y) => y.score - x.score || x.n - y.n)
    .slice(0, limit)
    .map((r) => ({ n: r.n, score: r.score, shared: sharedStems(wish.text, r.text) }));
}
