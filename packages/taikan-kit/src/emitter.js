// 極簡事件分派器
export class Emitter {
  constructor() { this.handlers = {}; }
  on(type, fn) {
    (this.handlers[type] ||= new Set()).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.handlers[type]?.delete(fn); }
  emit(type, e) {
    for (const fn of this.handlers[type] || []) fn(e);
    if (type !== '*') for (const fn of this.handlers['*'] || []) fn(e);
  }
}
