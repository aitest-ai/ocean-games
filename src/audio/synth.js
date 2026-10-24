// Synthesized rain and thunder (replacing CC BY-SA recordings, which a commercial release cannot
// use). Pure functions of (sampleRate, seed): they return Float32Array channels, so the same code
// fills Web Audio buffers in the browser and can be rendered to WAV in Node for listening tests.
// Every sound is deterministic for a given seed (the offline film needs the same mix every time).

const C = 343; // speed of sound (m/s)

function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

// RBJ biquad, applied in place.
function biquad(x, sr, type, f, q = 0.707) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // bandpass, 0 dB peak
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    let y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    if (y < 1e-25 && y > -1e-25) y = 0; // no denormals in long silent stretches (they are ~50x slower)
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); };
function scale(chs, k) { for (const x of chs) for (let i = 0; i < x.length; i++) x[i] *= k; return chs; }

// ── rain ────────────────────────────────────────────────────────────────────
// A heavy downpour heard from a little way off: thousands of drop impacts per second (short decaying
// noise ticks of log-normal size, each dulled by its own distance), a few near drops that give the
// patter its grain, and a diffuse wash. The band is shaped like a field recording of heavy rain
// (most energy 250 Hz – 4 kHz, centroid near 1.1 kHz). The buffer loops seamlessly: its start is
// crossfaded from the samples that follow its end. Level: RMS about -18 dBFS.
export function synthRain(sr, seconds = 8, seed = 7) {
  const f = Math.floor(sr * 0.5), len = Math.floor(sr * seconds), n = len + f;
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed * 31 + ch * 977);
    const d = new Float32Array(n);
    const drops = (rate, ampMu, ampSigma, decayMin, decayMax, lpMin, lpMax) => {
      const count = Math.floor(rate * n / sr);
      for (let k = 0; k < count; k++) {
        const at = Math.floor(r() * n), amp = Math.exp(ampMu + ampSigma * gauss(r));
        const tau = (decayMin + (decayMax - decayMin) * r()) * sr;
        const a = Math.exp(-1 / tau), g = 1 - Math.exp(-2 * Math.PI * (lpMin + (lpMax - lpMin) * r() * r()) / sr);
        const m = Math.min(n - at, Math.ceil(tau * 6));
        let env = amp, lp = 0;
        for (let i = 0; i < m; i++) { lp += ((r() * 2 - 1) - lp) * g; d[at + i] += lp * env; env *= a; }
      }
    };
    drops(2600, -1.6, 0.7, 0.0008, 0.004, 900, 6000); // the dense far field
    drops(40, -0.5, 0.6, 0.0015, 0.006, 2500, 9000);  // near drops: the patter
    // diffuse wash under the drops
    const wash = new Float32Array(n);
    for (let i = 0; i < n; i++) wash[i] = r() * 2 - 1;
    biquad(wash, sr, 'bandpass', 700, 0.6);
    for (let i = 0; i < n; i++) d[i] += wash[i] * 0.35;
    biquad(d, sr, 'highpass', 260, 0.7);
    biquad(d, sr, 'lowpass', 3200, 0.6);
    biquad(d, sr, 'lowpass', 4200, 0.6);
    for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * Math.sqrt(t) + d[len + i] * Math.sqrt(1 - t); } // equal power: no dip
    out.push(d.slice(0, len));
  }
  return scale(out, 0.12 / Math.max(rms(out[0]), rms(out[1])));
}

// ── thunder ─────────────────────────────────────────────────────────────────
// Thunder as the sum of the shock waves (N-waves) shed by every few metres of a tortuous lightning
// channel (after Ribner & Roy, 1982): each segment's pulse arrives r/c later, louder when the
// segment lies broadside to the listener, so straight stretches seen side-on stack into claps and
// the channel's spread in distance becomes the roll. Pulses lengthen with distance and lose their
// highs to air absorption (rendered in distance bands, each with its own low-pass); ground echoes
// and a scattered rumble that follows the pulse energy fill the tail.
// dist: horizontal distance from listener to the ground strike (m).
export function synthThunder(sr, { dist = 3000, seed = 1, seconds = 22, energy = 1 } = {}) {
  const r = rng(seed * 7919 + 13);
  // channel: ground strike up to the cloud base, then intracloud runs; plus a few branches
  const segs = [];
  const walk = (p, dir, length, amp, step = 8) => {
    let pref = dir.slice(), d = dir.slice();
    for (let s = 0; s < length; s += step) {
      if (r() < step / 180) { // a new macro direction every ~180 m (tortuosity at the 100 m scale)
        pref = norm([dir[0] + gauss(r) * 0.55, dir[1] + gauss(r) * 0.55, dir[2] + gauss(r) * 0.55]);
      }
      d = norm([pref[0] + gauss(r) * 0.28, pref[1] + gauss(r) * 0.28, pref[2] + gauss(r) * 0.28]);
      const q = [p[0] + d[0] * step, p[1] + d[1] * step, Math.max(1, p[2] + d[2] * step)];
      segs.push({ m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], d, len: step, amp });
      if (amp > 0.5 && r() < step / 900) walk(q, norm([d[0] + gauss(r) * 0.7, d[1] + gauss(r) * 0.7, -Math.abs(d[2]) - 0.3]), 200 + r() * 900, amp * 0.45);
      p = q;
    }
    return p;
  };
  const az = (r() - 0.5) * 1.2, strike = [dist * Math.cos(az), dist * Math.sin(az), 0];
  const base = 1800 + r() * 900;
  const top = walk(strike, [0, 0, 1], base, 1);
  for (let k = 0; k < 2; k++) { // intracloud runs heading off in two directions
    const h = r() * 2 * Math.PI;
    walk(top, norm([Math.cos(h), Math.sin(h), 0.15 * gauss(r)]), 3000 + r() * 3500, 1);
  }

  let rMin = Infinity;
  for (const s of segs) { s.r = Math.hypot(...s.m); rMin = Math.min(rMin, s.r); }
  const n = Math.floor(sr * seconds), lead = 0.25;
  const BANDS = [400, 900, 1800, 3500, 7000, 14000];
  const bandOf = (dd) => { let b = 0; while (b < BANDS.length - 1 && dd > BANDS[b]) b++; return b; };
  const bufs = [0, 1].map(() => BANDS.map(() => new Float32Array(n)));
  const energyEnv = new Float32Array(Math.ceil(n / 256) + 1);

  for (const s of segs) {
    const toL = [-s.m[0] / s.r, -s.m[1] / s.r, -s.m[2] / s.r];
    const cosT = Math.abs(s.d[0] * toL[0] + s.d[1] * toL[1] + s.d[2] * toL[2]);
    const broadside = 0.12 + Math.exp(-Math.pow(cosT / 0.22, 2));     // line-source radiation lobe
    const a = s.amp * broadside / (s.r / 300);                        // spherical spreading
    const tau = 0.0022 * Math.pow(s.r / 100, 0.3) * (0.8 + 0.4 * r());   // N-wave lengthens with range
    const t0 = (s.r - rMin) / C + lead;
    const b = bandOf(s.r);
    const elev = s.m[2] / s.r, echo = (2 * 1.6 * elev) / C;             // ground reflection, ears ~1.6 m up
    for (let ch = 0; ch < 2; ch++) {
      const jitter = (r() - 0.5) * 0.0012;                              // decorrelates the two ears
      addN(bufs[ch][b], sr, t0 + jitter, tau, a);
      addN(bufs[ch][b], sr, t0 + jitter + echo, tau, a * 0.6);
      // the nearest few hundred metres also tear: short sub-pulses from the channel's fine kinks
      // (the crack of a close strike; at a distance air absorption leaves only the roll)
      if (s.r < rMin + 700 && s.r < 1500) {
        const near = 1 - (s.r - rMin) / 700;
        for (let k = 0; k < 6; k++) addN(bufs[ch][b], sr, t0 + jitter + (r() - 0.5) * (s.len / C), 0.0003 + 0.0012 * r(), a * 2.2 * near * near);
      }
    }
    const ei = Math.floor((t0 * sr) / 256);
    if (ei < energyEnv.length) energyEnv[ei] += a * a * tau;
  }

  // distance bands: air absorption removes highs (roughly 4e6 / r Hz at the band's range)
  const out = [0, 1].map((ch) => {
    const mix = new Float32Array(n);
    BANDS.forEach((edge, b) => {
      const x = bufs[ch][b];
      const fc = Math.min(12000, Math.max(250, 4e6 / edge));
      biquad(x, sr, 'lowpass', fc, 0.6); biquad(x, sr, 'lowpass', fc * 1.3, 0.6);
      for (let i = 0; i < n; i++) mix[i] += x[i];
    });
    return mix;
  });

  // scattered rumble: low noise whose level follows the (smoothed) pulse energy, slowly released
  let acc = 0; const env = new Float32Array(energyEnv.length);
  const rel = Math.exp(-256 / (sr * 2.2));
  for (let i = 0; i < env.length; i++) { acc = Math.max(acc * rel, 0) + energyEnv[i]; env[i] = acc; }
  let emax = 0; for (const v of env) emax = Math.max(emax, v);
  const peak = Math.max(...out.map((x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0))) || 1;
  out.forEach((x, ch) => {
    const rr = rng(seed * 104729 + ch * 31 + 5);
    const rum = new Float32Array(n);
    let br = 0;
    for (let i = 0; i < n; i++) { br = (br + 0.03 * (rr() * 2 - 1)) / 1.03; rum[i] = br; }
    biquad(rum, sr, 'lowpass', 220, 0.7); biquad(rum, sr, 'highpass', 30, 0.7);
    const rk = (0.12 + 0.3 * Math.min(1, dist / 3000)) * peak / (rms(rum) * 6); // scattering grows with range
    for (let i = 0; i < n; i++) {
      const e = env[Math.floor(i / 256)] / emax;
      x[i] += rum[i] * rk * Math.sqrt(e);
    }
    biquad(x, sr, 'highpass', 22, 0.7);
    const fade = Math.floor(sr * 1.5); // the last seconds die away
    for (let i = 0; i < fade; i++) x[n - 1 - i] *= i / fade;
  });
  // a gentle soft limit (as a recorder's input stage would) so one stacked clap does not set the level
  const lim = 8 * Math.max(rms(out[0]), rms(out[1]));
  for (const x of out) for (let i = 0; i < n; i++) x[i] = lim * Math.tanh(x[i] / lim);
  // level like the recordings it replaces: RMS about -21 dBFS, peaks kept below 0.95
  const pk = Math.max(...out.map((x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0))) || 1;
  return scale(out, energy * Math.min(0.085 / Math.max(rms(out[0]), rms(out[1])), 0.95 / pk));
}

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// N-wave (a sonic boom's shape): a jump up, a linear fall through zero to the same depth, a jump
// back; the jumps are softened over a few samples so a single pulse never clicks.
function addN(x, sr, t0, tau, a) {
  const i0 = Math.floor(t0 * sr), m = Math.max(4, Math.floor(tau * sr)), e = 2;
  if (i0 < 0 || i0 + m >= x.length) return;
  for (let i = 0; i < m; i++) {
    const lin = 1 - (2 * i) / m;
    const w = i < e ? i / e : i > m - e ? (m - i) / e : 1;
    x[i0 + i] += a * lin * w;
  }
}
