/**
 * Akasha Library — Billing Module
 *
 * Unified coin balance, token estimation, and usage logging.
 * Monthly auto-reset of free allowance.
 */

const COIN_KEY = 'akasha-coin-balance';
const USAGE_KEY = 'akasha-coin-usage';
const FREE_MONTHLY = 100;
const MAX_LOG = 50;

function currentMonth() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getCoinData() {
  const defaults = { balance: FREE_MONTHLY, lastReset: null, serverAuthoritative: false };
  try {
    const saved = JSON.parse(localStorage.getItem(COIN_KEY));
    if (!saved) { localStorage.setItem(COIN_KEY, JSON.stringify(defaults)); return defaults; }
    // Do NOT auto-reset monthly — server is the authority
    return saved;
  } catch { localStorage.setItem(COIN_KEY, JSON.stringify(defaults)); return defaults; }
}

// ===== Public API =====

export function getBalance() {
  return getCoinData().balance;
}

export function hasSufficientBalance(tokens) {
  return getBalance() >= coinCost(tokens);
}

export function deductCoins(amount, description) {
  const data = getCoinData();
  data.balance = Math.max(0, data.balance - amount);
  localStorage.setItem(COIN_KEY, JSON.stringify(data));

  try {
    const log = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
    log.unshift({ amount, description, time: Date.now(), balance: data.balance });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    localStorage.setItem(USAGE_KEY, JSON.stringify(log));
  } catch { /* ignore */ }

  return data.balance;
}

export function getUsageLog() {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '[]'); }
  catch { return []; }
}

export function resetBalance() {
  const data = { balance: FREE_MONTHLY, lastReset: currentMonth() };
  localStorage.setItem(COIN_KEY, JSON.stringify(data));
  return FREE_MONTHLY;
}

export function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[一-鿿぀-ゟ゠-ヿ]/g) || []).length;
  const nonCjk = text.length - cjk;
  return Math.ceil(cjk * 0.6 + nonCjk * 0.25);
}

export function coinCost(tokens) {
  if (tokens <= 500) return 1;
  if (tokens <= 2000) return 3;
  return 5;
}

export function syncBalance(serverBalance) {
  if (typeof serverBalance !== 'number' || isNaN(serverBalance)) return;
  const data = getCoinData();
  data.balance = serverBalance;
  data.serverAuthoritative = true;
  data.lastSync = Date.now();
  localStorage.setItem(COIN_KEY, JSON.stringify(data));
}

export const FREE_ALLOWANCE = FREE_MONTHLY;
