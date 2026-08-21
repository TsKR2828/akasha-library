/**
 * Akasha Library — Session Memory (Phase 10-A)
 *
 * Per-module runtime conversation context, sessionStorage-backed.
 * Auto-writes without user confirmation. Clears on tab/window close.
 */

const PREFIX = 'akasha-session-';
const MAX_TURNS = 10;
const MAX_CHARS = 6000;

function createSession(module) {
  return {
    module: module || '_default',
    turns: [],
    facts: {},
    startedAt: Date.now(),
  };
}

export function getSession(module) {
  const key = PREFIX + (module || '_default');
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null') || createSession(module);
  } catch { return createSession(module); }
}

function save(module, session) {
  const key = PREFIX + (module || '_default');
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
  } catch (err) {
    if (isQuotaExceededError(err) && session.turns.length > 1) {
      // 空間不足：砍掉最舊一半的 turns 再重試一次，避免整段 session 寫入失敗
      session.turns = session.turns.slice(Math.ceil(session.turns.length / 2));
      try {
        sessionStorage.setItem(key, JSON.stringify(session));
      } catch (err2) {
        console.warn('session-memory: sessionStorage 寫入失敗（已嘗試刪除最舊一半 turns 後重試）', err2);
      }
    } else {
      console.warn('session-memory: sessionStorage 寫入失敗', err);
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

export function addTurn(module, role, text) {
  const session = getSession(module);
  session.turns.push({ role, text, time: Date.now() });
  if (session.turns.length > MAX_TURNS) {
    session.turns = session.turns.slice(-MAX_TURNS);
  }
  save(module, session);
  return session;
}

export function setFact(module, key, value) {
  const session = getSession(module);
  if (value == null) {
    delete session.facts[key];
  } else {
    session.facts[key] = value;
  }
  save(module, session);
}

export function getFact(module, key) {
  return getSession(module).facts[key] ?? null;
}

export function clearSession(module) {
  sessionStorage.removeItem(PREFIX + (module || '_default'));
}

export function clearAllSessions() {
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
  }
}

export function getSessionModules() {
  const modules = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PREFIX)) modules.push(key.slice(PREFIX.length));
  }
  return modules;
}

/**
 * Build messages array for LLM call.
 * Returns recent turns (trimmed to fit token budget) + current user message.
 */
export function buildMessages(module, currentMessage) {
  const session = getSession(module);
  const messages = [];
  let charCount = 0;

  const turns = session.turns.slice();
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (charCount + t.text.length > MAX_CHARS) break;
    messages.unshift({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.text });
    charCount += t.text.length;
  }

  messages.push({ role: 'user', content: currentMessage });
  return messages;
}

/**
 * Build session facts block for system prompt injection.
 * Returns empty string if no facts recorded.
 */
export function buildFactsBlock(module) {
  const session = getSession(module);
  const entries = Object.entries(session.facts).filter(([, v]) => v != null);
  if (entries.length === 0) return '';
  const lines = entries.map(([k, v]) => `- ${k}：${v}`);
  return `\n## 本次會話資訊\n${lines.join('\n')}`;
}
