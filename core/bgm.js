/**
 * Akasha Library — TsukiSynth BGM Core (Phase 14-B)
 *
 * score.json format, Web Audio API synthesis, preset system.
 * First batch instruments: Piano, 揚琴 (Yangqin), 空靈鼓 (Tongue Drum), 水鐘 (Water Chime).
 */

import { isFeatureEnabled } from './security.js';

// ── Score Format ──────────────────────────────────────────

/**
 * @typedef {Object} ScoreNote
 * @property {number} time     — start time in beats
 * @property {string} pitch    — e.g. 'C4', 'A#3', 'Db5'
 * @property {number} duration — in beats
 * @property {number} velocity — 0.0–1.0
 */

/**
 * @typedef {Object} Score
 * @property {string}      scoreId    — unique ID
 * @property {string}      instrument — 'piano'|'yangqin'|'tongue_drum'|'water_chime'
 * @property {number}      tempo      — BPM (40–200)
 * @property {string}      scale      — e.g. 'minor_pentatonic','major','dorian'
 * @property {string}      mood       — e.g. 'quiet_archive','gentle','meditative','flowing'
 * @property {ScoreNote[]} notes
 * @property {{ reverb?: number, delay?: number }} effects
 */

/**
 * Create a score object with defaults.
 * @param {Partial<Score> & { instrument: string }} opts
 * @returns {Score}
 */
export function createScore(opts) {
  return {
    scoreId:    opts.scoreId    ?? `score_${Date.now()}`,
    instrument: opts.instrument ?? 'piano',
    tempo:      clamp(opts.tempo ?? 72, 40, 200),
    scale:      opts.scale      ?? 'minor_pentatonic',
    mood:       opts.mood       ?? 'quiet_archive',
    notes:      opts.notes      ?? [],
    effects: {
      reverb: clamp(opts.effects?.reverb ?? 0.3, 0, 1),
      delay:  clamp(opts.effects?.delay  ?? 0.1, 0, 1),
    },
  };
}

// ── Instrument Definitions ────────────────────────────────

export const INSTRUMENTS = {
  piano: {
    name: 'Piano',
    nameZh: '鋼琴',
    waveform: 'triangle',
    attack: 0.01,
    decay: 0.3,
    sustain: 0.4,
    release: 0.8,
    harmonics: [1, 0.5, 0.25, 0.12],
  },
  yangqin: {
    name: 'Yangqin',
    nameZh: '揚琴',
    waveform: 'sine',
    attack: 0.005,
    decay: 0.15,
    sustain: 0.2,
    release: 1.2,
    harmonics: [1, 0.7, 0.3, 0.15, 0.08],
  },
  tongue_drum: {
    name: 'Tongue Drum',
    nameZh: '空靈鼓',
    waveform: 'sine',
    attack: 0.02,
    decay: 0.5,
    sustain: 0.6,
    release: 2.0,
    harmonics: [1, 0.3, 0.1],
  },
  water_chime: {
    name: 'Water Chime',
    nameZh: '水鐘',
    waveform: 'sine',
    attack: 0.001,
    decay: 0.1,
    sustain: 0.05,
    release: 3.0,
    harmonics: [1, 0.6, 0.4, 0.3, 0.2],
  },
};

// ── Scale Definitions ─────────────────────────────────────

const SCALE_INTERVALS = {
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  major:           [0, 2, 4, 5, 7, 9, 11],
  minor:           [0, 2, 3, 5, 7, 8, 10],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
};

export function getScaleNames() {
  return Object.keys(SCALE_INTERVALS);
}

// ── Presets (instrument + mood + pre-composed phrases) ────

export const PRESETS = [
  {
    id: 'quiet_archive_piano',
    name: '靜謐書庫',
    instrument: 'piano',
    tempo: 60,
    scale: 'minor_pentatonic',
    mood: 'quiet_archive',
    notes: [
      { time: 0,   pitch: 'D4', duration: 1.5, velocity: 0.35 },
      { time: 2,   pitch: 'A4', duration: 1.0, velocity: 0.3 },
      { time: 3.5, pitch: 'E4', duration: 2.0, velocity: 0.28 },
      { time: 6,   pitch: 'G4', duration: 1.5, velocity: 0.32 },
      { time: 8,   pitch: 'D5', duration: 2.0, velocity: 0.25 },
      { time: 10.5,pitch: 'A4', duration: 1.5, velocity: 0.3 },
      { time: 12.5,pitch: 'E4', duration: 2.5, velocity: 0.22 },
    ],
    effects: { reverb: 0.4, delay: 0.15 },
  },
  {
    id: 'gentle_yangqin',
    name: '柔風揚琴',
    instrument: 'yangqin',
    tempo: 72,
    scale: 'major_pentatonic',
    mood: 'gentle',
    notes: [
      { time: 0,   pitch: 'G4', duration: 0.5, velocity: 0.4 },
      { time: 0.5, pitch: 'A4', duration: 0.5, velocity: 0.38 },
      { time: 1,   pitch: 'B4', duration: 1.0, velocity: 0.42 },
      { time: 2.5, pitch: 'D5', duration: 0.75,velocity: 0.36 },
      { time: 3.5, pitch: 'E5', duration: 1.5, velocity: 0.34 },
      { time: 5.5, pitch: 'B4', duration: 1.0, velocity: 0.38 },
      { time: 7,   pitch: 'G4', duration: 2.0, velocity: 0.3 },
      { time: 9.5, pitch: 'A4', duration: 1.0, velocity: 0.35 },
      { time: 11,  pitch: 'D5', duration: 1.5, velocity: 0.32 },
    ],
    effects: { reverb: 0.35, delay: 0.2 },
  },
  {
    id: 'meditative_drum',
    name: '冥想空靈鼓',
    instrument: 'tongue_drum',
    tempo: 54,
    scale: 'minor_pentatonic',
    mood: 'meditative',
    notes: [
      { time: 0,   pitch: 'C4', duration: 2.0, velocity: 0.45 },
      { time: 3,   pitch: 'Eb4',duration: 2.0, velocity: 0.4 },
      { time: 6,   pitch: 'G4', duration: 2.5, velocity: 0.38 },
      { time: 9,   pitch: 'Bb4',duration: 2.0, velocity: 0.35 },
      { time: 12,  pitch: 'C5', duration: 3.0, velocity: 0.32 },
      { time: 16,  pitch: 'G4', duration: 2.5, velocity: 0.38 },
      { time: 19,  pitch: 'Eb4',duration: 3.0, velocity: 0.3 },
    ],
    effects: { reverb: 0.55, delay: 0.1 },
  },
  {
    id: 'flowing_chime',
    name: '流水水鐘',
    instrument: 'water_chime',
    tempo: 80,
    scale: 'major_pentatonic',
    mood: 'flowing',
    notes: [
      { time: 0,    pitch: 'E5', duration: 0.3, velocity: 0.5 },
      { time: 0.4,  pitch: 'G5', duration: 0.3, velocity: 0.45 },
      { time: 0.8,  pitch: 'A5', duration: 0.3, velocity: 0.4 },
      { time: 1.5,  pitch: 'E6', duration: 0.5, velocity: 0.35 },
      { time: 2.5,  pitch: 'B5', duration: 0.4, velocity: 0.42 },
      { time: 3.2,  pitch: 'G5', duration: 0.3, velocity: 0.38 },
      { time: 4,    pitch: 'A5', duration: 0.5, velocity: 0.4 },
      { time: 5,    pitch: 'E5', duration: 0.3, velocity: 0.45 },
      { time: 5.5,  pitch: 'B5', duration: 0.4, velocity: 0.36 },
      { time: 6.2,  pitch: 'E6', duration: 0.6, velocity: 0.3 },
      { time: 7.5,  pitch: 'G5', duration: 0.5, velocity: 0.42 },
    ],
    effects: { reverb: 0.6, delay: 0.25 },
  },
];

// ── Pitch → Frequency ─────────────────────────────────────

const NOTE_MAP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchToFreq(pitch) {
  const m = pitch.match(/^([A-G])(b|#)?(\d)$/);
  if (!m) return 440;
  let semitone = NOTE_MAP[m[1]];
  if (m[2] === '#') semitone++;
  if (m[2] === 'b') semitone--;
  const octave = parseInt(m[3], 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Web Audio Synth Engine ────────────────────────────────

let audioCtx = null;
let masterGain = null;
let reverbNode = null;
let delayNode = null;
let scheduledNodes = [];
let _playing = false;
let _onBgmState = null;

export function setBgmStateListener(fn) { _onBgmState = fn; }

function emitBgm(state, detail) {
  if (_onBgmState) _onBgmState(state, detail);
}

function ensureAudioCtx() {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;

  // Simple reverb via convolver (impulse approximation)
  reverbNode = audioCtx.createConvolver();
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * 2;
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  reverbNode.buffer = impulse;

  // Delay
  delayNode = audioCtx.createDelay(1.0);
  delayNode.delayTime.value = 0.25;
  const delayFeedback = audioCtx.createGain();
  delayFeedback.gain.value = 0.2;
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);

  masterGain.connect(audioCtx.destination);
  return audioCtx;
}

function playNote(ctx, instrument, note, startTime, effects) {
  const inst = INSTRUMENTS[instrument] || INSTRUMENTS.piano;
  const freq = pitchToFreq(note.pitch);
  const vel = note.velocity ?? 0.4;
  const { attack, decay, sustain, release, harmonics, waveform } = inst;

  const noteGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();

  dryGain.gain.value = 1 - (effects.reverb ?? 0.3) * 0.6;
  wetGain.gain.value = (effects.reverb ?? 0.3) * 0.6;

  noteGain.connect(dryGain);
  noteGain.connect(wetGain);
  dryGain.connect(masterGain);
  wetGain.connect(reverbNode);
  reverbNode.connect(masterGain);

  if ((effects.delay ?? 0) > 0.05) {
    const delayWet = ctx.createGain();
    delayWet.gain.value = effects.delay * 0.4;
    noteGain.connect(delayWet);
    delayWet.connect(delayNode);
    delayNode.connect(masterGain);
  }

  const oscs = [];
  for (let h = 0; h < harmonics.length; h++) {
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq * (h + 1);

    const hGain = ctx.createGain();
    hGain.gain.value = harmonics[h] * vel;
    osc.connect(hGain);
    hGain.connect(noteGain);
    oscs.push(osc);
  }

  // ADSR envelope
  const now = startTime;
  const dur = note.duration * (60 / clamp(note._tempo || 72, 40, 200));
  const peakTime = now + attack;
  const decayEnd = peakTime + decay;
  const sustainEnd = now + dur;
  const releaseEnd = sustainEnd + release;

  noteGain.gain.setValueAtTime(0, now);
  noteGain.gain.linearRampToValueAtTime(vel, peakTime);
  noteGain.gain.linearRampToValueAtTime(vel * sustain, decayEnd);
  noteGain.gain.setValueAtTime(vel * sustain, sustainEnd);
  noteGain.gain.linearRampToValueAtTime(0, releaseEnd);

  for (const osc of oscs) {
    osc.start(now);
    osc.stop(releaseEnd + 0.1);
    scheduledNodes.push(osc);
  }
  scheduledNodes.push(noteGain, dryGain, wetGain);
}

// ── Playback API ──────────────────────────────────────────

/**
 * Play a score.
 * @param {Score} score
 * @param {Object} [opts]
 * @param {number} [opts.volume] — 0.0–1.0
 * @returns {{ stop: Function, duration: number }}
 */
export function playScore(score, opts = {}) {
  if (!isFeatureEnabled('voice')) {
    throw new Error('Voice/BGM feature is disabled in this build');
  }

  stopScore();
  const ctx = ensureAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  masterGain.gain.value = clamp(opts.volume ?? 0.5, 0, 1);

  const tempo = score.tempo || 72;
  const beatDur = 60 / tempo;
  const baseTime = ctx.currentTime + 0.1;

  for (const note of score.notes) {
    const noteWithTempo = { ...note, _tempo: tempo };
    const startTime = baseTime + note.time * beatDur;
    playNote(ctx, score.instrument, noteWithTempo, startTime, score.effects || {});
  }

  const lastNote = score.notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0);
  const totalDuration = lastNote * beatDur + (INSTRUMENTS[score.instrument]?.release || 1);

  _playing = true;
  emitBgm('playing', { score, duration: totalDuration });

  const timeout = setTimeout(() => {
    _playing = false;
    emitBgm('stopped', { score });
  }, (totalDuration + 0.5) * 1000);

  return {
    duration: totalDuration,
    stop: () => { clearTimeout(timeout); stopScore(); },
  };
}

export function stopScore() {
  _playing = false;
  for (const node of scheduledNodes) {
    try { node.stop?.(); } catch {}
    try { node.disconnect?.(); } catch {}
  }
  scheduledNodes = [];
  emitBgm('stopped', null);
}

export function isPlaying() { return _playing; }

export function setVolume(v) {
  if (masterGain) masterGain.gain.value = clamp(v, 0, 1);
}

// ── Preset Helpers ────────────────────────────────────────

export function getPresets() { return [...PRESETS]; }

export function getPresetById(id) { return PRESETS.find(p => p.id === id) || null; }

export function presetToScore(preset) {
  return createScore({
    scoreId:    preset.id,
    instrument: preset.instrument,
    tempo:      preset.tempo,
    scale:      preset.scale,
    mood:       preset.mood,
    notes:      preset.notes,
    effects:    preset.effects,
  });
}

export function playPreset(presetId, opts) {
  const preset = getPresetById(presetId);
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);
  return playScore(presetToScore(preset), opts);
}

// ── Helpers ───────────────────────────────────────────────

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
