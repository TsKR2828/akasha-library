import React from "react";

/* ============================================================
   useVoiceTTS  (Phase 17 v2-5)

   Wraps the browser Web Speech API (speechSynthesis) with React state.
   Adapted from legacy/index.legacy.html Phase 14-A voice engine.

   Public API:
     { hasTTS, voices, settings, setSettings,
       state: { speaking, queueActive, queueIdx, queueTotal, currentText },
       speakOne(text),
       playQueue(blocks, startFrom = 0),
       stop() }

   `settings`:
     { voiceId, rate (0.5–2.0), pitch (0–2.0), includeNarration }

   `playQueue` filters blocks to dialogue (+ narration if enabled) then
   speaks them sequentially. Each utterance is awaited via onend.
   ============================================================ */

const SETTINGS_KEY = "sw_voice_settings_v1";
const DEFAULT_SETTINGS = {
  voiceId: "",
  rate: 1.0,
  pitch: 1.0,
  includeNarration: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const obj = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...obj };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

export function useVoiceTTS() {
  const hasTTS = typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";

  const [voices, setVoices] = React.useState([]);
  const [settings, setSettingsState] = React.useState(loadSettings);
  const [state, setState] = React.useState({
    speaking: false,
    queueActive: false,
    queueIdx: 0,
    queueTotal: 0,
    currentText: "",
  });

  // refs to avoid stale closures inside queue loop
  const settingsRef = React.useRef(settings);
  const voicesRef = React.useRef(voices);
  const abortRef = React.useRef(false);
  React.useEffect(() => { settingsRef.current = settings; saveSettings(settings); }, [settings]);
  React.useEffect(() => { voicesRef.current = voices; }, [voices]);

  // wrapped setSettings that persists
  const setSettings = React.useCallback((updater) => {
    setSettingsState(prev => typeof updater === "function" ? updater(prev) : { ...prev, ...updater });
  }, []);

  /* ---------- load voice list ---------- */
  React.useEffect(() => {
    if (!hasTTS) return;
    const load = () => setVoices(window.speechSynthesis.getVoices() || []);
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [hasTTS]);

  /* ---------- cleanup on unmount ---------- */
  React.useEffect(() => {
    return () => {
      if (hasTTS) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
      abortRef.current = true;
    };
  }, [hasTTS]);

  /* ---------- helpers ---------- */
  const applyVoice = (utt) => {
    const s = settingsRef.current;
    utt.rate = Math.min(2, Math.max(0.5, s.rate || 1));
    utt.pitch = Math.min(2, Math.max(0, s.pitch || 1));
    if (s.voiceId) {
      const v = voicesRef.current.find(x => x.name === s.voiceId);
      if (v) utt.voice = v;
    }
  };

  /* ---------- speak a single utterance ---------- */
  const speakOne = React.useCallback((text) => {
    if (!hasTTS || !text || !text.trim()) return;
    try { window.speechSynthesis.cancel(); } catch {}
    abortRef.current = false;

    const utt = new SpeechSynthesisUtterance(text);
    applyVoice(utt);
    utt.onstart = () => setState(s => ({ ...s, speaking: true, currentText: text }));
    utt.onend   = () => setState(s => ({ ...s, speaking: false, currentText: "" }));
    utt.onerror = () => setState(s => ({ ...s, speaking: false, currentText: "" }));
    window.speechSynthesis.speak(utt);
  }, [hasTTS]);

  /* ---------- stop everything ---------- */
  const stop = React.useCallback(() => {
    abortRef.current = true;
    if (hasTTS) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    setState({ speaking: false, queueActive: false, queueIdx: 0, queueTotal: 0, currentText: "" });
  }, [hasTTS]);

  /* ---------- play queue of blocks ---------- */
  const playQueue = React.useCallback(async (blocks, startFrom = 0) => {
    if (!hasTTS) return;
    // If already queued, stop first then restart
    abortRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
    // small yield so cancel processes
    await new Promise(r => setTimeout(r, 60));

    const queue = (blocks || []).filter(b =>
      b.type === "dialogue" ||
      (b.type === "narration" && settingsRef.current.includeNarration)
    );
    if (!queue.length) return;

    abortRef.current = false;
    setState({ speaking: false, queueActive: true, queueIdx: startFrom, queueTotal: queue.length, currentText: "" });

    for (let i = startFrom; i < queue.length; i++) {
      if (abortRef.current) break;
      const item = queue[i];
      const text = item.text || item.zh || item.original || "";
      if (!text.trim()) continue;

      setState(s => ({ ...s, queueIdx: i, currentText: text, speaking: true }));

      await new Promise((resolve) => {
        const utt = new SpeechSynthesisUtterance(text);
        applyVoice(utt);
        utt.onend = () => resolve();
        utt.onerror = () => resolve();
        try { window.speechSynthesis.speak(utt); }
        catch { resolve(); }
      });
    }

    setState(s => ({ ...s, queueActive: false, speaking: false, currentText: "" }));
    abortRef.current = false;
  }, [hasTTS]);

  return {
    hasTTS,
    voices,
    settings,
    setSettings,
    state,
    speakOne,
    playQueue,
    stop,
  };
}
