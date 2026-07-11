/**
 * Akasha Library — Report Voice Converter (Phase 14-C)
 *
 * Converts Daily Archive Report JSON → voice task sequence
 * for Rein-Voice playback (零韻朗讀稿).
 *
 * Input:  report JSON (spec §12.3)
 * Output: VoiceTask[] (spec §10.4)
 */

/**
 * Convert a daily archive report to a sequence of voice tasks.
 *
 * @param {Object} report — spec §12.3 format
 * @param {string} report.reportId
 * @param {string} report.date
 * @param {Array}  report.sections — [{ title, items: [{ source, title, summary }] }]
 * @param {Object} [opts]
 * @param {string} [opts.voiceId]      — TTS voice name (default: 'reiin_default')
 * @param {number} [opts.speed]        — playback rate (default: 1.0)
 * @param {string} [opts.greeting]     — custom opening line
 * @param {string} [opts.closing]      — custom closing line
 * @param {boolean}[opts.readSummary]  — include item summaries (default: true)
 * @param {boolean}[opts.readSource]   — mention source name (default: false)
 * @returns {VoiceTask[]}
 */
export function reportToVoiceTasks(report, opts = {}) {
  const voiceId  = opts.voiceId  ?? 'reiin_default';
  const speed    = opts.speed    ?? 1.0;
  const readSummary = opts.readSummary !== false;
  const readSource  = opts.readSource === true;

  const tasks = [];
  const task = (text, emotion = 'calm') => tasks.push({
    type: 'voice_task',
    voiceId,
    text,
    emotion,
    speed,
    pitch: 1.0,
    output: 'queue',
    speakerId: null,
    speaker: '零韻',
  });

  // Opening
  const dateStr = formatDate(report.date);
  const greeting = opts.greeting
    ?? `${dateStr}，阿卡夏圖書館每日館報。`;
  task(greeting, 'serena');

  if (!report.sections?.length) {
    task('今日暫無新消息。');
  } else {
    const sectionCount = report.sections.length;
    task(`今日共有${sectionCount}個主題。`, 'calm');

    for (let si = 0; si < report.sections.length; si++) {
      const section = report.sections[si];
      // Section heading
      task(`第${si + 1}則：${section.title}。`, 'cogitans');

      if (!section.items?.length) continue;

      for (const item of section.items) {
        // Item title
        let line = item.title;
        if (readSource && item.source) {
          line = `來源${item.source}：${item.title}`;
        }
        task(line, 'calm');

        // Item summary — rss-news 條目附 TTS 專用稿（item.voice），優先於顯示用 summary
        const spoken = item.voice || item.summary;
        if (readSummary && spoken) {
          task(spoken, 'calm');
        }
      }
    }
  }

  // Closing
  const closing = opts.closing
    ?? '以上是今日館報。如有疑問，隨時向我提問。';
  task(closing, 'serena');

  return tasks;
}

/**
 * Convert a report to a Markdown reading script (朗讀稿).
 * This is the text version of what Rein-Voice would read aloud.
 *
 * @param {Object} report
 * @param {Object} [opts] — same as reportToVoiceTasks
 * @returns {string} — Markdown text
 */
export function reportToReadingScript(report, opts = {}) {
  const tasks = reportToVoiceTasks(report, opts);
  const lines = [`# 館報朗讀稿 — ${report.date || ''}`, ''];

  for (const t of tasks) {
    lines.push(`> **零韻**：${t.text}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*${tasks.length} 段朗讀，預估 ${estimateReadTime(tasks)} 秒*`);
  return lines.join('\n');
}

/**
 * Estimate total reading time in seconds.
 * @param {Array} tasks — voice tasks
 * @returns {number}
 */
export function estimateReadTime(tasks) {
  const CPS = 4; // ~4 chars/sec for CJK at normal speed
  let total = 0;
  for (const t of tasks) {
    const chars = t.text?.length || 0;
    const speed = t.speed || 1.0;
    total += chars / (CPS * speed);
    total += 0.5; // pause between tasks
  }
  return Math.round(total);
}

// ── Helpers ───────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '今日';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${m[1]}年${parseInt(m[2])}月${parseInt(m[3])}日`;
}
