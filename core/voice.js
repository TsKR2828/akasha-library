/**
 * Akasha Library — Rein-Voice Core (Phase 14-A)
 *
 * Voice task format, Web Speech TTS playback, and task queue.
 * Gate: requires isFeatureEnabled('voice') === true.
 */

import { isFeatureEnabled } from './security.js';

// ── Voice Task Format ─────────────────────────────────────

/**
 * @typedef {Object} VoiceTask
 * @property {'voice_task'}   type
 * @property {string}         voiceId   — TTS voice identifier (SpeechSynthesis.name or 'reiin_default')
 * @property {string}         text      — text to speak
 * @property {string}         emotion   — e.g. 'calm','angry','happy' (informational; no engine mapping yet)
 * @property {number}         speed     — playback rate (0.5–2.0, default 1.0)
 * @property {number}         pitch     — pitch (0–2, default 1.0)
 * @property {'preview'|'queue'} output — 'preview' = play immediately, 'queue' = add to queue
 * @property {string|null}    speakerId — optional character ID
 * @property {string|null}    speaker   — display name
 */

/**
 * Create a voice task object.
 * @param {Partial<VoiceTask> & { text: string }} opts
 * @returns {VoiceTask}
 */
export function createVoiceTask(opts) {
  return {
    type:      'voice_task',
    voiceId:   opts.voiceId  ?? 'reiin_default',
    text:      opts.text,
    emotion:   opts.emotion  ?? 'calm',
    speed:     clamp(opts.speed ?? 1.0, 0.5, 2.0),
    pitch:     clamp(opts.pitch ?? 1.0, 0, 2),
    output:    opts.output   ?? 'preview',
    speakerId: opts.speakerId ?? null,
    speaker:   opts.speaker   ?? null,
  };
}

// ── Available Voices ──────────────────────────────────────

let cachedVoices = null;

export function getAvailableVoices() {
  if (!window.speechSynthesis) return [];
  const raw = window.speechSynthesis.getVoices();
  if (raw.length) {
    cachedVoices = raw;
    return raw;
  }
  return cachedVoices || [];
}

export function waitForVoices() {
  return new Promise(resolve => {
    const voices = getAvailableVoices();
    if (voices.length) return resolve(voices);
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      resolve(getAvailableVoices());
    }, { once: true });
    setTimeout(() => resolve(getAvailableVoices()), 2000);
  });
}

function resolveVoice(voiceId) {
  const voices = getAvailableVoices();
  if (!voices.length || voiceId === 'reiin_default') return null;
  return voices.find(v => v.name === voiceId) || null;
}

// ── Playback Engine ───────────────────────────────────────

let currentUtterance = null;
let onStateChange = null;

export function setStateListener(fn) { onStateChange = fn; }

function emit(state, detail) {
  if (onStateChange) onStateChange(state, detail);
}

/**
 * Speak a single voice task. Returns a promise that resolves when done.
 * @param {VoiceTask} task
 * @returns {Promise<void>}
 */
export function speak(task) {
  if (!isFeatureEnabled('voice')) {
    return Promise.reject(new Error('Voice feature is disabled in this build'));
  }
  if (!window.speechSynthesis) {
    return Promise.reject(new Error('SpeechSynthesis API not available'));
  }

  return new Promise((resolve, reject) => {
    stop();

    const utt = new SpeechSynthesisUtterance(task.text);
    utt.rate  = task.speed;
    utt.pitch = task.pitch;

    const voice = resolveVoice(task.voiceId);
    if (voice) utt.voice = voice;

    utt.onstart = () => emit('speaking', task);
    utt.onend   = () => { currentUtterance = null; emit('idle', task); resolve(); };
    utt.onerror = (e) => {
      currentUtterance = null;
      if (e.error === 'canceled') { emit('idle', task); resolve(); }
      else { emit('error', { task, error: e.error }); reject(new Error(e.error)); }
    };

    currentUtterance = utt;
    window.speechSynthesis.speak(utt);
  });
}

export function stop() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function pause() {
  if (window.speechSynthesis) window.speechSynthesis.pause();
  emit('paused', null);
}

export function resume() {
  if (window.speechSynthesis) window.speechSynthesis.resume();
  emit('speaking', null);
}

export function isSpeaking() {
  return !!(window.speechSynthesis && window.speechSynthesis.speaking);
}

// ── Task Queue ────────────────────────────────────────────

let queue = [];
let queueIndex = -1;
let queueActive = false;

export function enqueue(tasks) {
  const arr = Array.isArray(tasks) ? tasks : [tasks];
  queue.push(...arr.map(t => createVoiceTask({ ...t, output: 'queue' })));
  emit('queue-updated', { length: queue.length, index: queueIndex });
}

export function clearQueue() {
  stop();
  queue = [];
  queueIndex = -1;
  queueActive = false;
  emit('queue-updated', { length: 0, index: -1 });
}

export function getQueue() {
  return { tasks: [...queue], index: queueIndex, active: queueActive };
}

export async function playQueue(startIndex = 0) {
  if (!queue.length) return;
  queueActive = true;
  queueIndex = startIndex;

  for (let i = startIndex; i < queue.length; i++) {
    if (!queueActive) break;
    queueIndex = i;
    emit('queue-progress', { index: i, total: queue.length, task: queue[i] });
    try {
      await speak(queue[i]);
    } catch {
      break;
    }
  }

  queueActive = false;
  emit('queue-done', { played: queueIndex + 1, total: queue.length });
}

export function stopQueue() {
  queueActive = false;
  stop();
}

// ── Script Blocks → Voice Tasks ───────────────────────────

/**
 * Convert dialogue blocks to voice tasks (for Script Editor integration).
 * @param {Array} blocks — script blocks (from parser)
 * @param {Object} [opts]
 * @param {string} [opts.voiceId]
 * @param {number} [opts.speed]
 * @param {boolean} [opts.includeNarration] — also read narration blocks
 * @returns {VoiceTask[]}
 */
export function blocksToVoiceTasks(blocks, opts = {}) {
  return blocks
    .filter(b => b.type === 'dialogue' || (opts.includeNarration && b.type === 'narration'))
    .map(b => createVoiceTask({
      text:      b.text,
      voiceId:   b.voice || opts.voiceId || 'reiin_default',
      emotion:   b.emotion || 'calm',
      speed:     opts.speed ?? 1.0,
      speaker:   b.speaker || null,
      speakerId: b.speakerId || null,
      output:    'queue',
    }));
}

// ── Helpers ───────────────────────────────────────────────

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
