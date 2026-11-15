/* Shared, dependency-free request guard for crop/typing/navigation races. */
(function (root) {
  class RequestGate {
    constructor() { this.revision = 0; }
    invalidate() { this.revision += 1; }
    begin() { const revision = ++this.revision; return () => revision === this.revision; }
  }
  function lines(value) { return value.split('\n').map(s => s.trim()).filter(Boolean); }
  const core = { RequestGate, lines };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else root.PracticeCore = core;
})(globalThis);
