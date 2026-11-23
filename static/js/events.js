// Page coordination is wired in main.js so pages do not import each other.
const listeners = new Map();
export function on(name, callback) {
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push(callback);
}
export function emit(name) {
  for (const callback of listeners.get(name) || []) callback();
}
