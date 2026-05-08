/**
 * Akasha Library — Chat History
 *
 * Per-module conversation persistence via localStorage.
 * Each module has its own independent message array.
 */

const CHAT_PREFIX = 'akasha-chat-';
const MAX_MESSAGES = 100;

export function getHistory(module) {
  const key = CHAT_PREFIX + (module || '_default');
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
}

export function addMessage(module, role, text) {
  const key = CHAT_PREFIX + (module || '_default');
  const history = getHistory(module);
  history.push({ role, text, time: Date.now() });
  if (history.length > MAX_MESSAGES) history.splice(0, history.length - MAX_MESSAGES);
  localStorage.setItem(key, JSON.stringify(history));
  return history;
}

export function clearHistory(module) {
  localStorage.removeItem(CHAT_PREFIX + (module || '_default'));
}

export function clearAllHistory() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CHAT_PREFIX)) localStorage.removeItem(key);
  }
}

export function getHistoryModules() {
  const modules = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CHAT_PREFIX)) {
      modules.push(key.slice(CHAT_PREFIX.length));
    }
  }
  return modules;
}
