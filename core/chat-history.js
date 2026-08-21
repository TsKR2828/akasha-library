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
  setHistoryWithQuotaGuard(key, history);
  return history;
}

/**
 * Write history to localStorage; on QuotaExceededError, drop the oldest half
 * of the records and retry once instead of silently losing the whole write.
 * Mutates `history` in place so callers holding the same reference see the trim.
 */
function setHistoryWithQuotaGuard(key, history) {
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (err) {
    if (isQuotaExceededError(err) && history.length > 1) {
      const kept = history.slice(Math.ceil(history.length / 2));
      history.length = 0;
      history.push(...kept);
      try {
        localStorage.setItem(key, JSON.stringify(history));
      } catch (err2) {
        console.warn('chat-history: localStorage 寫入失敗（已嘗試刪除最舊一半紀錄後重試）', err2);
      }
    } else {
      console.warn('chat-history: localStorage 寫入失敗', err);
    }
  }
}

function isQuotaExceededError(err) {
  return !!err && (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
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
