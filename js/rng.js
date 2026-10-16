// Seeded randomness helpers. Rooms are generated from a seed so they can be shared by URL.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeedString() {
  return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}

export function makeRng(rand = Math.random) {
  return {
    rand,
    range: (a, b) => a + rand() * (b - a),
    int: (a, b) => a + Math.floor(rand() * (b - a + 1)),
    chance: (p) => rand() < p,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    // pairs: [[value, weight], ...]
    weighted(pairs) {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      if (total <= 0) return undefined;
      let r = rand() * total;
      for (const [v, w] of pairs) {
        r -= w;
        if (r < 0) return v;
      }
      return pairs[pairs.length - 1][0];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
