/**
 * Akasha Library — Prewritten Response DB
 *
 * Local keyword-matched responses for common questions.
 * Checked before LLM calls to save API usage.
 *
 * Flow: user message → matchPrewritten() → hit → return response
 *                                        → miss → proceed to LLM
 */

const RESPONSES = {
  _global: [
    {
      keywords: ['你好', '哈囉', '嗨', 'hello', 'hi'],
      response: '你好！我是零韻，阿卡夏圖書館的司書。有什麼我能幫你的嗎？',
    },
    {
      keywords: ['你是誰', '自我介紹', 'who are you'],
      response: '我是月上零韻（Tsukiue Rein），阿卡夏圖書館的 AI 圖書館員。我可以幫你閱讀文件、分析資料、整理表格，以及回答各種問題。',
    },
    {
      keywords: ['你能做什麼', '有什麼功能', '功能列表', '能幫我什麼'],
      response: '阿卡夏圖書館目前有三個主要模組：\n· PDF 閱讀器 — 閱讀 PDF、加書籤、頁面切割、截圖\n· Code & Data — 閱讀程式碼與資料檔（.py .json .md .txt）\n· Table Forge — 表格資料匯入、編輯與匯出\n\n在各模組中開啟檔案後，我可以根據內容回答你的問題。',
    },
    {
      keywords: ['謝謝', '感謝', 'thanks', 'thank you'],
      response: '不客氣！有其他問題隨時可以問我。',
    },
    {
      keywords: ['怎麼使用', '使用說明', '新手', '教學'],
      response: '選擇左側選單的工具模組，開啟檔案後就可以開始使用。我會根據你目前使用的模組自動切換身份，提供對應的協助。',
    },
    {
      keywords: ['api key', 'apikey', '金鑰', '設定金鑰'],
      response: '請至左側選單的「AI 設定」頁面配置 API Key。支援 OpenAI、Anthropic、Google，以及自訂端點（Ollama / LM Studio 等）。金鑰僅存在瀏覽器 session 中，關閉分頁即清除。',
    },
    {
      keywords: ['月幣', 'coin', '計費'],
      response: '月幣是阿卡夏的 AI 使用額度。每次 AI 問答根據 token 數消耗 1～5 月幣。使用 BYOK（自帶金鑰）模式則不消耗月幣。',
    },
  ],

  'pdf-reader': [
    {
      keywords: ['怎麼開啟', '如何開啟', '怎麼打開', '開啟 pdf'],
      response: '點擊工具列的「開啟檔案」按鈕選擇 PDF，或直接將 PDF 檔案拖放到閱讀區域即可。',
    },
    {
      keywords: ['書籤', 'bookmark'],
      response: '在閱讀 PDF 時，點擊工具列的書籤按鈕即可為目前頁面新增書籤。書籤列表可跳頁、重新命名或刪除，資料存在瀏覽器中，不會遺失。',
    },
    {
      keywords: ['截圖', '框選', 'screenshot'],
      response: '點擊截圖按鈕後，在頁面上拖拉框選想要擷取的區域，放開後即可儲存為 PNG。可以存入書庫或下載到本機。',
    },
    {
      keywords: ['切割', '合併', '選頁'],
      response: '點擊切割按鈕後，會顯示頁碼網格。勾選需要的頁面，系統會將選取的頁面合併成新的 PDF 供下載或存入書庫。',
    },
  ],

  markdown: [
    {
      keywords: ['支援什麼格式', '什麼格式', '可以開什麼'],
      response: '支援 .py、.json、.score.json、.md、.txt 五種格式。每種格式有對應的視圖模式（如 Markdown 預覽、Pretty JSON、樹狀 JSON、Python 語法高亮等）。',
    },
    {
      keywords: ['怎麼編輯', '如何編輯', '可以編輯'],
      response: '.md、.txt、.json 檔案可以直接編輯。點擊工具列的編輯按鈕進入編輯模式，JSON 編輯時會即時驗證格式。編輯後可存入書庫或下載。',
    },
    {
      keywords: ['怎麼匯出', '匯出', 'export', 'sheets'],
      response: '有多種匯出方式：\n· 複製原始內容 / 複製目前視圖\n· 下載檔案\n· 匯出結構化摘要 .md\n· 複製為 HTML（WordPress 用）\n· 轉成 Sheets 格式\n· 送到 Table Forge 做進一步處理',
    },
    {
      keywords: ['score.json', 'tsukisynth'],
      response: 'score.json 是 TsukiSynth 的評分檔案格式，會以專用儀表板顯示素材清單、事件時間軸與匯出設定。',
    },
  ],

  'table-forge': [
    {
      keywords: ['怎麼匯入', '如何匯入', '匯入資料'],
      response: '支援拖放或選擇 Markdown 表格、JSON 陣列、CSV 檔案匯入。也可以從 Code & Data 模組直接送資料過來。',
    },
    {
      keywords: ['支援什麼格式', '什麼格式', '可以開什麼'],
      response: '匯入支援 Markdown 表格、JSON 陣列、CSV / TSV。匯出支援 Markdown、JSON、CSV、TSV，也可複製為 Google Sheets 格式。',
    },
    {
      keywords: ['怎麼匯出', '匯出', 'export'],
      response: '編輯完成後，可透過工具列選擇匯出格式（Markdown / JSON / CSV / TSV），或直接複製為可貼入 Google Sheets 的格式。',
    },
  ],
};

/**
 * Match user message against prewritten responses.
 * Checks module-specific entries first, then global.
 *
 * @param {string} text - User's message
 * @param {string|null} module - Current module key
 * @returns {string|null} Response text, or null if no match
 */
export function matchPrewritten(text, module) {
  if (!text) return null;
  const input = text.toLowerCase().trim();
  if (input.length > 60) return null;

  const moduleEntries = module && RESPONSES[module] ? RESPONSES[module] : [];
  const globalEntries = RESPONSES._global;

  for (const entry of moduleEntries) {
    if (entry.keywords.some(kw => input.includes(kw.toLowerCase()))) {
      return entry.response;
    }
  }

  for (const entry of globalEntries) {
    if (entry.keywords.some(kw => input.includes(kw.toLowerCase()))) {
      return entry.response;
    }
  }

  return null;
}
