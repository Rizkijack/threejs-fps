// One seeded generator for the whole game: map dressing, bot aim error and spread all draw
// from it, so a capture with ?seed=N replays the same frame. mulberry32 is small, fast and
// good enough for gameplay noise; it is not a security primitive.
export function createRng(seed) {
  let a = seed | 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}
