// This is a learning drill, not an umpire or a full-match simulator.
export const MODES = ['batting', 'running', 'fielding'];
export class ChoiceGate {
  constructor() { this.reset(); }
  reset() { this.leanReady = true; this.last = -Infinity; }
  action(event, now, count, index) {
    if (!Number.isFinite(now) || count < 1) return null;
    if (event.type === 'lean' && event.side === 'center') { this.leanReady = true; return null; }
    if (now - this.last < 650) return null;
    if (event.type === 'lean' && this.leanReady && ['left','right'].includes(event.side)) {
      this.leanReady = false; this.last = now;
      return { type: 'select', index: (index + (event.side === 'left' ? -1 : 1) + count) % count };
    }
    if (event.type === 'raise' && event.side === 'both') { this.last = now; return { type: 'confirm' }; }
    return null;
  }
}
export class TeeDrill {
  constructor() { this.reset(); }
  reset() { this.stage = 'idle'; this.start = null; this.result = null; }
  arm(now) { this.stage = 'waiting'; this.start = now; this.result = null; }
  tick(now) {
    if (this.stage === 'waiting' && now - this.start >= 2200) this.stage = 'ready';
    if (this.stage === 'ready' && now - this.start > 6200) { this.stage = 'done'; this.result = 'waited'; }
    return this.stage;
  }
  hit(now) {
    this.tick(now);
    if (!['waiting', 'ready'].includes(this.stage)) return null;
    this.result = this.stage === 'ready' ? 'safe' : 'early'; this.stage = 'done'; return this.result;
  }
  cancel() { this.reset(); }
}
export function validateScenario(s) {
  return !!s && typeof s.id === 'string' && MODES.includes(s.mode) &&
    typeof s.prompt === 'string' && Array.isArray(s.options) && s.options.length >= 2 &&
    s.options.length <= 4 && s.options.every(o => typeof o.id === 'string' && typeof o.text === 'string') &&
    new Set(s.options.map(o => o.id)).size === s.options.length &&
    s.options.some(o => o.id === s.correct) && typeof s.explanation === 'string';
}
export function grade(s, id) {
  if (!validateScenario(s) || !s.options.some(o => o.id === id)) return null;
  return { correct: id === s.correct, explanation: s.explanation };
}
export function canUseCameraAction({ camera, active, paused, tracking }) {
  return camera && active && !paused && tracking === 'ok';
}
export function nextIndex(index, length) { return length ? (index + 1) % length : 0; }
