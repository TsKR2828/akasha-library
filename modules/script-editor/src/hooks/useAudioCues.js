import React from "react";

/* ============================================================
   useAudioCues  (v3-3 / v3-4 / v3-5 · tsuki-synth 整合)

   播放 tsuki-synth 預渲染的 BGM / SFX。劇本中的
     #bgm：<sound_id>   → 循環背景音（換曲時 1 秒交叉淡化）
     #sfx：<sound_id>   → 單次音效
   由這個 hook 觸發。

   音檔來源：private-assets/audio/（由 scripts/sync-audio.js 產生）。
   這個資料夾不進 git、也不進公開版 build（tsuki-synth 為專有授權），
   所以公開版找不到 manifest.json 時 status 會是 "unavailable"，
   面板顯示 cue 清單但停用播放。

   用 Web Audio（AudioBufferSourceNode）而不是 <audio>：
   循環可用 loopEnd 精準卡在原始 WAV 長度，避免 MP3 尾端補零造成的空拍；
   三軌（語音 / BGM / SFX）各自有 GainNode，BGM 另有 duck 節點給語音壓低用。

   Public API:
     { status, manifest, nowBgm, settings, setSettings,
       has(id), preload(ids), playCue(kind, id), playBgm(id), stopBgm(fadeMs),
       playSfx(id), stopAll(), duck(on) }
   ============================================================ */

const SETTINGS_KEY = "sw_audio_settings_v1";
const DEFAULT_SETTINGS = { bgm: 0.7, sfx: 0.9, enabled: true };
const CROSSFADE_SEC = 1.0;
const DUCK_LEVEL = 0.7; // 語音播放時 BGM 降 30%

export function audioBaseUrl() {
  // dist/script-editor/index.html → ../../private-assets/audio/
  return new URL("../../private-assets/audio/", document.baseURI).href;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAudioCues() {
  const [status, setStatus] = React.useState("checking"); // checking | ready | unavailable
  const [manifest, setManifest] = React.useState(null);
  const [nowBgm, setNowBgm] = React.useState(null);
  const [settings, setSettingsState] = React.useState(loadSettings);

  const ctxRef = React.useRef(null);
  const nodesRef = React.useRef(null);      // { master, bgm, duck, sfx }
  const buffersRef = React.useRef(new Map()); // id → Promise<AudioBuffer>
  const bgmRef = React.useRef(null);        // { id, src, gain }
  const settingsRef = React.useRef(settings);
  const soundsRef = React.useRef(new Map()); // id → manifest entry

  React.useEffect(() => {
    settingsRef.current = settings;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    const n = nodesRef.current;
    if (n && ctxRef.current) {
      const t = ctxRef.current.currentTime;
      n.bgm.gain.setTargetAtTime(settings.bgm, t, 0.05);
      n.sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
    }
  }, [settings]);

  const setSettings = React.useCallback((patch) => {
    setSettingsState(prev => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  /* ---------- manifest：判斷這個 build 有沒有音檔 ---------- */
  React.useEffect(() => {
    let alive = true;
    fetch(audioBaseUrl() + "manifest.json", { cache: "no-cache" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(m => {
        if (!alive) return;
        const map = new Map();
        for (const s of m.sounds || []) map.set(s.id, s);
        soundsRef.current = map;
        setManifest(m);
        setStatus(map.size ? "ready" : "unavailable");
      })
      .catch(() => { if (alive) setStatus("unavailable"); });
    return () => { alive = false; };
  }, []);

  /* ---------- 卸載時關掉 AudioContext ---------- */
  React.useEffect(() => () => {
    try { ctxRef.current?.close(); } catch {}
  }, []);

  const ensureCtx = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const master = ctx.createGain();
      const duck = ctx.createGain();
      const bgm = ctx.createGain();
      const sfx = ctx.createGain();
      bgm.gain.value = settingsRef.current.bgm;
      sfx.gain.value = settingsRef.current.sfx;
      bgm.connect(duck).connect(master);
      sfx.connect(master);
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      nodesRef.current = { master, duck, bgm, sfx };
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  };

  const has = React.useCallback((id) => soundsRef.current.has(id), []);

  const loadBuffer = (id) => {
    const entry = soundsRef.current.get(id);
    if (!entry) return Promise.reject(new Error("音色庫沒有 " + id));
    if (!buffersRef.current.has(id)) {
      const p = fetch(audioBaseUrl() + entry.file)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("HTTP " + r.status))))
        .then(ab => ctxRef.current.decodeAudioData(ab));
      p.catch(() => buffersRef.current.delete(id));
      buffersRef.current.set(id, p);
    }
    return buffersRef.current.get(id);
  };

  /** 預先下載＋解碼（朗讀前呼叫，避免 cue 觸發時才開始下載而晚響） */
  const preload = React.useCallback(async (ids) => {
    if (!ensureCtx()) return;
    const list = [...new Set(ids || [])].filter(id => soundsRef.current.has(id));
    await Promise.allSettled(list.map(loadBuffer));
  }, []);

  const fadeOutAndStop = (voice, sec) => {
    const ctx = ctxRef.current;
    if (!ctx || !voice) return;
    const t = ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
      voice.gain.gain.linearRampToValueAtTime(0, t + sec);
      voice.src.stop(t + sec + 0.05);
    } catch {}
  };

  const stopBgm = React.useCallback((fadeMs = 1000) => {
    const cur = bgmRef.current;
    bgmRef.current = null;
    setNowBgm(null);
    fadeOutAndStop(cur, Math.max(0.01, fadeMs / 1000));
  }, []);

  const playBgm = React.useCallback(async (id) => {
    if (!settingsRef.current.enabled || !soundsRef.current.has(id)) return false;
    if (bgmRef.current?.id === id) return true;
    const ctx = ensureCtx();
    if (!ctx) return false;
    let buf;
    try { buf = await loadBuffer(id); } catch { return false; }
    const entry = soundsRef.current.get(id);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // 卡在原始 WAV 長度，切掉編碼器尾端補零，循環才不會有空拍
    const exact = Number(entry.duration_sec) || buf.duration;
    src.loopStart = 0;
    src.loopEnd = Math.min(buf.duration, exact);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + CROSSFADE_SEC);
    src.connect(gain).connect(nodesRef.current.bgm);
    src.start(t);
    fadeOutAndStop(bgmRef.current, CROSSFADE_SEC);
    bgmRef.current = { id, src, gain };
    setNowBgm(id);
    return true;
  }, []);

  const playSfx = React.useCallback(async (id) => {
    if (!settingsRef.current.enabled || !soundsRef.current.has(id)) return false;
    const ctx = ensureCtx();
    if (!ctx) return false;
    let buf;
    try { buf = await loadBuffer(id); } catch { return false; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(nodesRef.current.sfx);
    src.start();
    return true;
  }, []);

  const playCue = React.useCallback((kind, id) => {
    const k = String(kind || "").toLowerCase();
    const v = String(id || "").trim();
    if (!v) return Promise.resolve(false);
    if (k === "bgm") {
      if (v === "stop" || v === "off" || v === "none") { stopBgm(1000); return Promise.resolve(true); }
      return playBgm(v);
    }
    if (k === "sfx") return playSfx(v);
    return Promise.resolve(false);
  }, [playBgm, playSfx, stopBgm]);

  const stopAll = React.useCallback(() => {
    stopBgm(300);
  }, [stopBgm]);

  const duck = React.useCallback((on) => {
    const n = nodesRef.current;
    if (!n || !ctxRef.current) return;
    n.duck.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, ctxRef.current.currentTime, 0.15);
  }, []);

  return { status, manifest, nowBgm, settings, setSettings, has, preload, playCue, playBgm, stopBgm, playSfx, stopAll, duck };
}
