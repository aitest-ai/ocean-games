// Size statistics for the fish database (data/fishing): lognormal length distributions, percentiles,
// length → weight, size classes, and the release rule. Pure functions, used by the game and the tests.

export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7)
export function erf(x) {
  const s = Math.sign(x), a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
export const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// species.length.catch = { p50, p95 } (cm) → lognormal { mu, sigma }
export function lognormal(catchDist) {
  const p50 = catchDist.p50.value ?? catchDist.p50, p95 = catchDist.p95.value ?? catchDist.p95;
  return { mu: Math.log(p50), sigma: Math.max((Math.log(p95) - Math.log(p50)) / 1.6449, 0.02) };
}

// share (0..1) of typical catches of this species that are shorter than lengthCm
export function percentile(species, lengthCm) {
  const { mu, sigma } = lognormal(species.length.catch);
  return phi((Math.log(lengthCm) - mu) / sigma);
}

// a random catch length: lognormal, kept between the species' min catch length and its common maximum
export function sampleLength(species, rand) {
  const { mu, sigma } = lognormal(species.length.catch);
  const lo = val(species.length.min), hi = val(species.length.maxCommon);
  for (let i = 0; i < 12; i++) {
    const u = Math.max(rand(), 1e-9), v = rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const L = Math.exp(mu + sigma * z);
    if (L >= lo && L <= hi) return Math.round(L * 10) / 10;
  }
  return Math.round(Math.exp(mu) * 10) / 10;
}

// W = a·L^b (g, cm); `condition` is this individual's plumpness (1 = average)
export function weightOf(species, lengthCm, condition = 1) {
  const lw = species.lengthWeight;
  return val(lw.a) * Math.pow(lengthCm, val(lw.b)) * condition;
}

export const SIZE_CLASSES = [
  { max: 0.15, key: 'xs', label: '小型', tone: 'small' },
  { max: 0.4, key: 's', label: '中小型', tone: 'small' },
  { max: 0.6, key: 'm', label: '中型', tone: 'mid' },
  { max: 0.85, key: 'l', label: '中大型', tone: 'big' },
  { max: 0.97, key: 'xl', label: '大型', tone: 'big' },
  { max: 1.01, key: 'xxl', label: '特大型（很少見）', tone: 'huge' },
];
export const sizeClass = (p) => SIZE_CLASSES.find((c) => p < c.max) || SIZE_CLASSES[SIZE_CLASSES.length - 1];

// must this catch go back? { required, reason, basis } from species.conservation.release
export function releaseRule(species, lengthCm) {
  const r = species.conservation?.release;
  if (!r) return { required: false };
  const mode = val(r.mode);
  if (mode === 'always') return { required: true, basis: r.basis, reason: r.reason };
  if (mode === 'belowSize' && lengthCm < val(r.sizeCm)) return { required: true, basis: r.basis, reason: r.reason, sizeCm: val(r.sizeCm) };
  return { required: false, sizeCm: mode === 'belowSize' ? val(r.sizeCm) : null, basis: r.basis };
}

// every datum in the database is either a bare value or { value, src, license, status, note }
export const val = (x) => (x !== null && typeof x === 'object' && 'value' in x ? x.value : x);
