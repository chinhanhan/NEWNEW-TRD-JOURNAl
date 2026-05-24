const STORAGE_KEY = "trd-journey-os-v1";
const LEGACY_KEY = "trd-journey-v1";
const LANGUAGE_KEY = "trd-journey-language";
const IMAGE_LIMIT = 850 * 1024;

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);

function parseMarkdown(text) {
  if (!text) return "";
  let html = text;
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Highlight
  html = html.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  
  const lines = html.split("\n");
  const processedLines = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith("- ")) {
      if (!inList) { processedLines.push("<ul>"); inList = true; }
      processedLines.push(`<li>${line.substring(2)}</li>`);
    } else {
      if (inList) { processedLines.push("</ul>"); inList = false; }
      if (line.startsWith("> ")) {
        processedLines.push(`<blockquote>${line.substring(2)}</blockquote>`);
      } else if (line.startsWith("# ")) {
        processedLines.push(`<h3>${line.substring(2)}</h3>`);
      } else {
        processedLines.push(line);
      }
    }
  }
  if (inList) processedLines.push("</ul>");

  // Join back and add <br> for remaining newlines outside of blocks
  return processedLines.join("\n").replace(/\n/g, "<br>");
}

window.insertMarkdown = function(btn, prefix, suffix) {
  const container = btn.closest(".markdown-editor-container");
  if (!container) return;
  const textarea = container.querySelector("textarea");
  if (!textarea) return;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const before = text.substring(0, start);
  const selected = text.substring(start, end);
  const after = text.substring(end);
  
  textarea.value = before + prefix + selected + suffix + after;
  textarea.focus();
  // Put cursor in the middle or after
  textarea.setSelectionRange(start + prefix.length, end + prefix.length);
};

const starterTrades = [
  { id: "1", date: "2026-05-13", symbol: "NQ", setup: "Opening Drive", direction: "Long", grade: "A", risk: 100, pnl: 230, rule: true, emotion: "Focused", note: "Clean drive after range break.", checklist: { hasPlan: true, hasTrigger: true, hasStop: true, hasTarget: true, emotionControlled: true }, tradingViewUrl: "https://www.tradingview.com/chart/" },
  { id: "2", date: "2026-05-14", symbol: "ES", setup: "Range Fade", direction: "Short", grade: "B", risk: 100, pnl: -80, rule: true, emotion: "Calm", note: "Exit respected.", checklist: { hasPlan: true, hasTrigger: true, hasStop: true, hasTarget: false, emotionControlled: true } },
  { id: "3", date: "2026-05-15", symbol: "NQ", setup: "Liquidity Sweep", direction: "Long", grade: "A", risk: 120, pnl: 300, rule: true, emotion: "Focused", note: "Sweep into HTF level.", checklist: { hasPlan: true, hasTrigger: true, hasStop: true, hasTarget: true, emotionControlled: true } },
  { id: "4", date: "2026-05-18", symbol: "CL", setup: "Breakout Retest", direction: "Long", grade: "C", risk: 80, pnl: -110, rule: false, emotion: "FOMO", note: "Entered before retest completed.", checklist: { hasPlan: false, hasTrigger: false, hasStop: true, hasTarget: false, emotionControlled: false } },
  { id: "5", date: "2026-05-19", symbol: "NQ", setup: "Pullback Continuation", direction: "Short", grade: "A", risk: 100, pnl: 170, rule: true, emotion: "Calm", note: "One pullback, one decision.", checklist: { hasPlan: true, hasTrigger: true, hasStop: true, hasTarget: true, emotionControlled: true } },
  { id: "6", date: "2026-05-20", symbol: "GC", setup: "Liquidity Sweep", direction: "Short", grade: "B", risk: 90, pnl: -45, rule: true, emotion: "Hesitant", note: "Reduced size after late signal.", checklist: { hasPlan: true, hasTrigger: true, hasStop: true, hasTarget: false, emotionControlled: false } },
  { id: "7", date: "2026-05-21", symbol: "NQ", setup: "Opening Drive", direction: "Long", grade: "A", risk: 100, pnl: 260, rule: true, emotion: "Focused", note: "Held to target without moving stop.", checklist: { hasPlan: true, hasTrigger: true, hasStop: true, hasTarget: true, emotionControlled: true }, imageUrl: "https://s3.tradingview.com/snapshots/x/x8KQ6Y1R.png" }
];

const defaultPreferences = {
  defaultSymbol: "NQ",
  riskPerTrade: 100,
  dailyMaxLossR: -2,
  maxTradesPerDay: 3,
  setups: ["Opening Drive", "Pullback Continuation", "Liquidity Sweep", "Range Fade", "Breakout Retest"],
  dailyRules: ["Only A setups before 11:30", "Stop trading at -2R", "No revenge trades", "One setup, one decision"]
};

const defaultSopDetails = {
  market: "Futures",
  timeframe: "Intraday",
  status: "active",
  levelNotes: "",
  entryRules: "Define location, trigger, invalidation, and target before entry.",
  exitRules: "Exit at invalidation or planned target. Do not move stop impulsively.",
  riskRules: "Risk stays within the planned R. No averaging down.",
  noTradeRules: "No trade when the setup is unclear, rushed, or emotionally forced.",
  checklist: ["Location", "Trigger", "Invalidation", "Target", "Emotion controlled"],
  weaknesses: ["Early entry", "Moving stop", "Holding without target"]
};

let journalView = "timeline";

let state = null;
let selectedDay = todayISO();
let activeModule = null;
let language = localStorage.getItem(LANGUAGE_KEY) || "en";
let theme = localStorage.getItem("trd-journey-theme") || "light";
document.documentElement.setAttribute("data-theme", theme);
let interactionState = {
  sourceModule: null,
  transitionTimer: null
};

const dictionary = {
  en: {
    switchLanguage: "中文",
    homeTitle: "Choose your next move.",
    homeCopy: "Plan quietly. Execute cleanly. Review what the data actually says.",
    today: "Today",
    journal: "Journal",
    review: "Review",
    system: "System",
    back: "Back",
    logTrade: "Log Trade",
    planReady: "Plan ready",
    planMissing: "Plan missing",
    open: "Open",
    closed: "closed",
    last: "Last",
    processLeak: "process leak",
    risk: "Risk",
    backupReady: "Backup ready",
    openTrades: "Open Trades",
    liveExecution: "Live execution",
    startTrade: "Start Trade",
    noOpenTrades: "No open trades.",
    reviewPrompt: "Close open trades to complete review.",
    working: "Working",
    leaking: "Leaking",
    nextFocus: "Next Focus",
    noData: "No data",
    addTrades: "Add closed trades",
    closeTrade: "Close Trade",
    rResult: "R Result",
    rHint: "Use R when you want statistics before exact dollars.",
    pnlWins: "If both are filled, Net P&L is used.",
    needsResult: "Add Net P&L or R Result to close this trade.",
    tradeClosed: "Trade closed.",
    languageSaved: "Language updated.",
    maxDailyLoss: "Max daily loss",
    maxTrades: "Max trades"
  },
  zh: {
    switchLanguage: "EN",
    homeTitle: "选择下一步。",
    homeCopy: "安静计划。干净执行。复盘真实数据。",
    today: "今日",
    journal: "交易记录",
    review: "复盘",
    system: "系统",
    back: "返回",
    logTrade: "记录交易",
    planReady: "计划已完成",
    planMissing: "缺少计划",
    open: "进行中",
    closed: "已完成",
    last: "上一笔",
    processLeak: "流程泄漏",
    risk: "风险",
    backupReady: "可备份",
    openTrades: "进行中交易",
    liveExecution: "执行中",
    startTrade: "开始记录",
    noOpenTrades: "暂无进行中交易。",
    reviewPrompt: "完成进行中交易后再结束复盘。",
    working: "有效的部分",
    leaking: "泄漏的部分",
    nextFocus: "下一步专注",
    noData: "暂无数据",
    addTrades: "添加已完成交易",
    closeTrade: "结束交易",
    rResult: "R 结果",
    rHint: "还没有精确金额时，可以先用 R 统计。",
    pnlWins: "如果同时填写，优先使用 Net P&L。",
    needsResult: "请填写 Net P&L 或 R Result 后再结束交易。",
    tradeClosed: "交易已结束。",
    languageSaved: "语言已更新。",
    maxDailyLoss: "每日最大亏损",
    maxTrades: "最大交易数"
  }
};

function t(key) {
  return dictionary[language]?.[key] || dictionary.en[key] || key;
}

function defaultState() {
  const base = {
    version: 1,
    preferences: structuredClone(defaultPreferences),
    trades: starterTrades.map((trade) => normalizeTrade(trade)),
    dailyPlans: {
      [todayISO()]: { bias: "Wait for confirmation near key levels.", levels: "Previous high / low, session open", allowedSetups: "Opening Drive, Liquidity Sweep", maxLossR: -2, maxTrades: 3 }
    },
    dailyReviews: {}
  };
  return ensureSopState(base);
}

const DB_NAME = "trd-journey-db";
const DB_VERSION = 1;
const STORE_NAME = "app-state";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(val, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadState() {
  try {
    const idbSaved = await idbGet(STORAGE_KEY);
    if (idbSaved) return normalizeState(idbSaved);
  } catch (e) {
    console.error("IDB load failed", e);
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      await idbSet(STORAGE_KEY, parsed);
      return normalizeState(parsed);
    } catch (e) {}
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const parsed = { trades: JSON.parse(legacy) };
      await idbSet(STORAGE_KEY, parsed);
      return normalizeState(parsed);
    } catch (e) {}
  }
  return defaultState();
}

function normalizeState(raw) {
  return ensureSopState({
    version: 1,
    preferences: { ...structuredClone(defaultPreferences), ...(raw.preferences || {}) },
    trades: (raw.trades || []).map(normalizeTrade),
    dailyPlans: raw.dailyPlans || {},
    dailyReviews: raw.dailyReviews || {},
    sops: raw.sops || [],
    accounts: raw.accounts || [],
    activeSopId: raw.activeSopId || "",
    activeAccountId: raw.activeAccountId || "",
    backtests: (raw.backtests || []).map(bt => ({
      id: String(bt.id || uid()),
      sopId: String(bt.sopId || ""),
      sopName: String(bt.sopName || ""),
      capital: Number(bt.capital || 10000),
      riskMode: bt.riskMode || "fixed-usd",
      riskVal: Number(bt.riskVal || 100),
      trades: Array.isArray(bt.trades) ? bt.trades.map(Number) : [],
      date: bt.date || todayISO()
    }))
  });
}

function normalizeTrade(trade) {
  const status = trade.status === "open" ? "open" : "closed";
  return {
    id: String(trade.id || uid()),
    status,
    date: trade.date || todayISO(),
    closedAt: trade.closedAt || (status === "closed" ? trade.date || todayISO() : ""),
    symbol: trade.symbol || defaultPreferences.defaultSymbol,
    setup: trade.setup || defaultPreferences.setups[0],
    direction: trade.direction || "Long",
    grade: trade.grade || "B",
    risk: Number(trade.risk || 0),
    pnl: trade.pnl === "" || trade.pnl == null ? 0 : Number(trade.pnl || 0),
    rule: trade.rule !== false,
    emotion: trade.emotion || "Calm",
    note: trade.note || "",
    entryPlan: trade.entryPlan || trade.entryNote || "",
    entryNote: trade.entryNote || "",
    stopPlan: trade.stopPlan || "",
    targetPlan: trade.targetPlan || "",
    exitNote: trade.exitNote || "",
    checklist: { hasPlan: false, hasTrigger: false, hasStop: false, hasTarget: false, emotionControlled: false, ...(trade.checklist || {}) },
    tradingViewUrl: trade.tradingViewUrl || "",
    imageUrl: trade.imageUrl || "",
    imageData: trade.imageData || "",
    sopId: trade.sopId || "",
    accountId: trade.accountId || ""
  };
}

function makeSopId(name) {
  return `sop-${String(name || "sop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid()}`;
}

function makeAccountId(sopId, name) {
  return `acct-${sopId.replace(/^sop-/, "")}-${String(name || "main").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid()}`;
}

function ensureSopState(rawState) {
  const setupNames = [...new Set([
    ...(rawState.preferences?.setups || defaultPreferences.setups),
    ...(rawState.trades || []).map((trade) => trade.setup).filter(Boolean)
  ])];
  const existingSops = (rawState.sops || []).map((sop) => ({
    id: sop.id || makeSopId(sop.name),
    name: sop.name || "Untitled SOP",
    createdAt: sop.createdAt || todayISO(),
    archivedAt: sop.archivedAt || "",
    ...structuredClone(defaultSopDetails),
    ...sop,
    checklist: Array.isArray(sop.checklist) ? sop.checklist : String(sop.checklist || defaultSopDetails.checklist.join("\n")).split("\n").map((item) => item.trim()).filter(Boolean),
    weaknesses: Array.isArray(sop.weaknesses) ? sop.weaknesses : String(sop.weaknesses || defaultSopDetails.weaknesses.join("\n")).split("\n").map((item) => item.trim()).filter(Boolean)
  }));
  const sopsByName = new Map(existingSops.map((sop) => [sop.name, sop]));
  for (const setup of setupNames) {
    if (!sopsByName.has(setup)) {
      const id = makeSopId(setup);
      const sop = { id, name: setup, createdAt: todayISO(), archivedAt: "", ...structuredClone(defaultSopDetails) };
      existingSops.push(sop);
      sopsByName.set(setup, sop);
    }
  }
  const existingAccounts = (rawState.accounts || []).map((account) => ({
    id: account.id || makeAccountId(account.sopId || existingSops[0]?.id || "sop-main", account.name),
    sopId: account.sopId || existingSops[0]?.id || "",
    name: account.name || "Main Account",
    type: account.type || "Main",
    startingBalance: Number(account.startingBalance ?? account.currentBalance ?? 1000),
    currentBalance: Number(account.currentBalance ?? account.startingBalance ?? 1000),
    status: account.status || "active",
    createdAt: account.createdAt || todayISO(),
    archivedAt: account.archivedAt || ""
  }));
  for (const sop of existingSops) {
    if (!existingAccounts.some((account) => account.sopId === sop.id)) {
      existingAccounts.push({ id: makeAccountId(sop.id, "Main Account"), sopId: sop.id, name: "Main Account", type: "Main", startingBalance: 1000, currentBalance: 1000, status: "active", createdAt: todayISO(), archivedAt: "" });
    }
  }
  const firstSop = existingSops[0];
  const trades = (rawState.trades || []).map((trade) => {
    const sop = existingSops.find((item) => item.id === trade.sopId) || sopsByName.get(trade.setup) || firstSop;
    const account = existingAccounts.find((item) => item.id === trade.accountId && item.sopId === sop?.id) || existingAccounts.find((item) => item.sopId === sop?.id);
    return { ...trade, sopId: sop?.id || "", accountId: account?.id || "" };
  });
  const activeSopId = existingSops.some((sop) => sop.id === rawState.activeSopId) ? rawState.activeSopId : firstSop?.id || "";
  const activeAccount = existingAccounts.find((account) => account.id === rawState.activeAccountId && account.sopId === activeSopId) || existingAccounts.find((account) => account.sopId === activeSopId);
  return {
    ...rawState,
    sops: existingSops,
    accounts: existingAccounts,
    trades,
    activeSopId,
    activeAccountId: activeAccount?.id || ""
  };
}

async function saveState() {
  try {
    await idbSet(STORAGE_KEY, JSON.parse(JSON.stringify(state)));
  } catch (e) {
    console.error("IDB save failed", e);
  }
}

function activeSop() {
  return state.sops.find((sop) => sop.id === state.activeSopId) || state.sops[0];
}

function accountsForSop(sopId = state.activeSopId) {
  return state.accounts.filter((account) => account.sopId === sopId);
}

function activeAccount() {
  return state.accounts.find((account) => account.id === state.activeAccountId) || accountsForSop()[0];
}

function visibleTrades() {
  const sopId = state.activeSopId || activeSop()?.id;
  const accountId = state.activeAccountId || activeAccount()?.id;
  return state.trades.filter((trade) => trade.sopId === sopId && (!accountId || trade.accountId === accountId));
}

function activeSopTrades() {
  return visibleTrades();
}

function sopTrades(sopId) {
  return state.trades.filter((trade) => trade.sopId === sopId);
}

function accountName(id) {
  return state.accounts.find((account) => account.id === id)?.name || "Archived Account";
}

function accountLabel(account = activeAccount()) {
  if (!account) return "No account";
  return `${account.name}${account.type ? ` · ${account.type}` : ""}`;
}

function sopName(id) {
  return state.sops.find((sop) => sop.id === id)?.name || "Archived SOP";
}

function closedTrades(trades = visibleTrades()) {
  return trades.filter((trade) => trade.status !== "open");
}

function openTrades(trades = visibleTrades()) {
  return trades.filter((trade) => trade.status === "open");
}

function rValue(trade) {
  return trade.risk ? trade.pnl / trade.risk : 0;
}

function formatR(value) {
  return `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}R`;
}

function metrics(trades = closedTrades()) {
  const source = closedTrades(trades);
  const rList = source.map(rValue);
  const wins = rList.filter((r) => r > 0);
  const losses = rList.filter((r) => r < 0);
  const grossWin = wins.reduce((sum, r) => sum + r, 0);
  const grossLoss = Math.abs(losses.reduce((sum, r) => sum + r, 0));
  let curve = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of rList) {
    curve += r;
    peak = Math.max(peak, curve);
    maxDrawdown = Math.min(maxDrawdown, curve - peak);
  }
  return {
    count: source.length,
    totalR: rList.reduce((sum, r) => sum + r, 0),
    expectancy: rList.length ? rList.reduce((sum, r) => sum + r, 0) / rList.length : 0,
    winRate: rList.length ? wins.length / rList.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    maxDrawdown
  };
}

function byDate(date) {
  return visibleTrades().filter((trade) => trade.date === date);
}

function closedByDate(date) {
  return closedTrades().filter((trade) => trade.date === date || trade.closedAt === date);
}

function groupBy(trades, key) {
  return trades.reduce((map, trade) => {
    const value = trade[key] || "Unknown";
    map[value] ||= [];
    map[value].push(trade);
    return map;
  }, {});
}

function dateRange(start, end) {
  const days = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function weekRange(date = todayISO()) {
  const d = new Date(`${date}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const start = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 6);
  return [start, d.toISOString().slice(0, 10)];
}

function monthRange(date = todayISO()) {
  const d = new Date(`${date}T00:00:00`);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function tradesInRange(start, end) {
  return closedTrades().filter((trade) => {
    const date = trade.closedAt || trade.date;
    return date >= start && date <= end;
  });
}

function processLeakRate(trades = visibleTrades()) {
  const source = closedTrades(trades);
  if (!source.length) return 0;
  const leaks = source.filter((trade) => !trade.rule || trade.grade === "C").length;
  return leaks / source.length;
}

function streak() {
  const days = [...new Set(closedTrades().map((trade) => trade.closedAt || trade.date))].sort();
  let current = 0;
  let direction = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const total = metrics(closedByDate(days[i])).totalR;
    const sign = total > 0 ? 1 : total < 0 ? -1 : 0;
    if (!direction) direction = sign;
    if (sign === direction && sign !== 0) current += 1;
    else break;
  }
  return { count: current, direction };
}

function sopProgress(sopId = state.activeSopId) {
  const trades = sopId === state.activeSopId ? visibleTrades() : sopTrades(sopId);
  const closed = closedTrades(trades);
  const m = metrics(closed);
  const screenshots = trades.filter((trade) => imageFor(trade)).length;
  const aGrades = closed.filter((trade) => trade.grade === "A").length;
  const followed = closed.filter((trade) => trade.rule).length;
  return {
    records: trades.length,
    closed: closed.length,
    screenshots,
    expectancy: m.expectancy,
    totalR: m.totalR,
    winRate: m.winRate,
    ruleRate: closed.length ? followed / closed.length : 0,
    aGradeRate: closed.length ? aGrades / closed.length : 0,
    lastUsed: trades.slice().sort((a, b) => (b.closedAt || b.date).localeCompare(a.closedAt || a.date))[0]?.date || ""
  };
}

function sopLevel(progress) {
  const score = progress.records + progress.screenshots * 2 + Math.round(progress.ruleRate * 10) + Math.round(progress.aGradeRate * 8);
  if (progress.records >= 100 && progress.ruleRate >= 0.75) return { level: 5, name: "Mature", score };
  if (progress.records >= 50 && progress.ruleRate >= 0.65) return { level: 4, name: "Refined", score };
  if (progress.records >= 25) return { level: 3, name: "Clear", score };
  if (progress.records >= 10) return { level: 2, name: "Tested", score };
  return { level: 1, name: "Draft", score };
}

function sopWeaknessProfile(sopId = state.activeSopId) {
  const closed = closedTrades(sopId === state.activeSopId ? visibleTrades() : sopTrades(sopId));
  if (!closed.length) return "Needs more records";
  const leaks = closed.filter((trade) => !trade.rule || trade.grade === "C");
  const emotionRows = Object.entries(groupBy(leaks.length ? leaks : closed, "emotion"))
    .map(([name, list]) => ({ name, count: list.length, ...metrics(list) }))
    .sort((a, b) => b.count - a.count || a.expectancy - b.expectancy);
  return emotionRows[0] ? `${emotionRows[0].name} is the clearest leak` : "Execution looks clean";
}

function sopUpgradeSuggestion(sopId = state.activeSopId) {
  const sop = state.sops.find((item) => item.id === sopId);
  const progress = sopProgress(sopId);
  if (!progress.records) return "Collect the first clean example.";
  if (progress.screenshots < Math.min(progress.records, 5)) return "Attach more screenshots to build evidence.";
  if (progress.ruleRate < 0.75) return "Tighten the checklist around the repeated rule break.";
  if ((sop?.weaknesses || []).length < 3) return "Name one more weakness after the next review.";
  return "Refine one entry rule with your best example.";
}

function timelineGroups(trades = visibleTrades()) {
  return trades.slice().sort((a, b) => (b.closedAt || b.date).localeCompare(a.closedAt || a.date)).reduce((groups, trade) => {
    const day = trade.closedAt || trade.date;
    groups[day] ||= [];
    groups[day].push(trade);
    return groups;
  }, {});
}

function renderAll() {
  applyLanguage();
  populateStaticLabels();
  populateSetupOptions();
  populateSopControls();
  populateSettings();
  populateWorkflowForms();
  renderHomeSummary();
  renderHomeVisuals();
  renderMetrics();
  renderCharts();
  renderInsights();
  renderJournal();
  renderSopJourney();
  renderTodayOpenTrades();
  renderAnalytics();
  renderWorkflow();
  renderCycles();
  renderPlaybook();
  renderThemeButtons();
  applyLanguage();
  
  // Custom panels collapse
  initCollapsiblePanels();
}

function renderHomeSummary() {
  if (!document.getElementById("home")) return;
  const [weekStart, weekEnd] = weekRange();
  const weekTrades = tradesInRange(weekStart, weekEnd);
  const week = metrics(weekTrades);
  const all = metrics();
  const planReady = Boolean(state.dailyPlans[todayISO()]);
  const openCount = openTrades().length;
  const closed = closedTrades();
  const lastTrade = [...closed].sort((a, b) => (b.closedAt || b.date).localeCompare(a.closedAt || a.date))[0];
  const sop = activeSop();
  const progress = sopProgress(sop?.id);
  const level = sopLevel(progress);
  setText("homeTodayValue", formatR(week.totalR));
  setText("homeTodayMeta", `${planReady ? t("planReady") : t("planMissing")} | ${t("open")}: ${openCount}`);
  setText("homeJournalValue", `Level ${level.level} ${level.name}`);
  setText("homeJournalMeta", `${sop?.name || "SOP"} | ${progress.records} records${lastTrade ? ` | ${t("last")}: ${lastTrade.symbol}` : ""}`);
  setText("homeReviewValue", formatR(all.expectancy));
  setText("homeReviewMeta", `${Math.round(processLeakRate() * 100)}% ${t("processLeak")}`);
  setText("homeSystemValue", `${state.sops.length} SOPs`);
  setText("homeSystemMeta", `${accountsForSop().length} accounts | ${t("backupReady")}`);
}

function populateStaticLabels() {
  const todayLabel = document.getElementById("todayLabel");
  if (todayLabel) {
    todayLabel.textContent = new Date().toLocaleDateString(language === "zh" ? "zh-CN" : "en", { weekday: "long", month: "long", day: "numeric" });
  }
  const guardText = document.getElementById("guardrailText");
  if (guardText) {
    guardText.textContent = `${t("maxDailyLoss")}: ${state.preferences.dailyMaxLossR}R`;
  }
  const guardMeta = document.getElementById("guardrailMeta");
  if (guardMeta) {
    guardMeta.textContent = `${t("maxTrades")}: ${state.preferences.maxTradesPerDay} | ${t("risk")}: ${money(state.preferences.riskPerTrade)}`;
  }
}

function renderHomeVisuals() {
  if (!document.getElementById("home")) return;
  renderMiniSparkline("homeTodaySparkline", equitySeries());
  const openCount = openTrades().length;
  const closedCount = closedTrades().length;
  const total = Math.max(openCount + closedCount, 1);
  document.getElementById("homeJournalStatus").innerHTML = `
    <i style="width:${Math.max((openCount / total) * 100, openCount ? 12 : 0)}%"></i>
    <b style="width:${Math.max((closedCount / total) * 100, closedCount ? 12 : 0)}%"></b>
  `;
  document.getElementById("homeLeakMeter").style.setProperty("--leak", `${Math.round(processLeakRate() * 100)}%`);
  document.getElementById("homeSystemHealth").classList.toggle("is-warning", state.sops.length < 2);
}

function renderMiniSparkline(id, values) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const width = 160;
  const height = 42;
  const pad = 4;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / spread) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  svg.innerHTML = `<polyline points="${points}"></polyline>`;
}

function populateSetupOptions() {
  const setupSelect = document.getElementById("setupSelect");
  const current = setupSelect.value;
  setupSelect.innerHTML = state.preferences.setups.map((setup) => `<option>${safe(setup)}</option>`).join("");
  setupSelect.value = state.preferences.setups.includes(current) ? current : state.preferences.setups[0];
  const filter = document.getElementById("setupFilter");
  const filterValue = filter.value;
  filter.innerHTML = `<option value="All">All setups</option>${state.preferences.setups.map((setup) => `<option>${safe(setup)}</option>`).join("")}`;
  filter.value = ["All", ...state.preferences.setups].includes(filterValue) ? filterValue : "All";
}

function populateSopControls() {
  const active = activeSop();
  if (!active) return;
  const sopOptions = state.sops.filter((sop) => !sop.archivedAt).map((sop) => `<option value="${safe(sop.id)}">${safe(sop.name)}</option>`).join("");
  ["activeSopSelect", "tradeSopSelect"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = sopOptions;
    select.value = state.sops.some((sop) => sop.id === current) ? current : active.id;
  });
  const accounts = accountsForSop(active.id).filter((account) => !account.archivedAt);
  if (!accounts.some((account) => account.id === state.activeAccountId)) state.activeAccountId = accounts[0]?.id || "";
  const accountOptions = accounts.map((account) => `<option value="${safe(account.id)}">${safe(account.name)}</option>`).join("");
  const filter = document.getElementById("accountFilterSelect");
  if (filter) {
    filter.innerHTML = accountOptions;
    filter.value = state.activeAccountId || accounts[0]?.id || "";
  }
  const tradeAccountSelect = document.getElementById("tradeAccountSelect");
  if (tradeAccountSelect) {
    tradeAccountSelect.innerHTML = accountOptions;
    tradeAccountSelect.value = state.activeAccountId || accounts[0]?.id || "";
  }
}

function populateSettings() {
  const form = document.getElementById("settingsForm");
  form.defaultSymbol.value = state.preferences.defaultSymbol;
  form.riskPerTrade.value = state.preferences.riskPerTrade;
  form.dailyMaxLossR.value = state.preferences.dailyMaxLossR;
  form.maxTradesPerDay.value = state.preferences.maxTradesPerDay;
  form.setups.value = state.preferences.setups.join("\n");
  form.dailyRules.value = state.preferences.dailyRules.join("\n");
}

function populateWorkflowForms() {
  const day = selectedDay || todayISO();
  const plan = state.dailyPlans[day] || {};
  const review = state.dailyReviews[day] || {};
  const planForm = document.getElementById("planForm");
  const reviewForm = document.getElementById("reviewForm");
  planForm.workflowDate.value = day;
  planForm.bias.value = plan.bias || "";
  planForm.levels.value = plan.levels || "";
  planForm.allowedSetups.value = plan.allowedSetups || state.preferences.setups.slice(0, 2).join(", ");
  planForm.maxLossR.value = plan.maxLossR ?? state.preferences.dailyMaxLossR;
  planForm.maxTrades.value = plan.maxTrades ?? state.preferences.maxTradesPerDay;
  reviewForm.workflowDate.value = day;
  reviewForm.keep.value = review.keep || "";
  reviewForm.remove.value = review.remove || "";
  reviewForm.focus.value = review.focus || "";
}

function setWorkflowDate(day) {
  selectedDay = day || todayISO();
  populateWorkflowForms();
  renderWorkflow();
  renderCycles();
}

function renderMetrics() {
  const m = metrics();
  setText("expectancyMetric", formatR(m.expectancy));
  setText("winRateMetric", `${Math.round(m.winRate * 100)}%`);
  setText("profitFactorMetric", Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "inf");
  setText("drawdownMetric", formatR(m.maxDrawdown));
  setText("tradeCountLabel", `${m.count} trades`);
  document.getElementById("expectancyMetric").closest(".metric-card").classList.toggle("negative", m.expectancy < 0);
  document.getElementById("drawdownMetric").closest(".metric-card").classList.toggle("negative", m.maxDrawdown < 0);
}

function renderCharts() {
  renderLineChart("equityChart", equitySeries(), { negative: false });
  renderLineChart("drawdownChart", drawdownSeries(), { negative: true });
}

function equitySeries() {
  let total = 0;
  return [{ value: 0, label: "Start" }, ...closedTrades().map((trade) => {
    total += rValue(trade);
    return { value: total, label: trade.date, detail: `${trade.symbol} (${formatR(rValue(trade))})` };
  })];
}

function drawdownSeries() {
  let total = 0;
  let peak = 0;
  return [{ value: 0, label: "Start" }, ...closedTrades().map((trade) => {
    total += rValue(trade);
    peak = Math.max(peak, total);
    return { value: total - peak, label: trade.date, detail: `${trade.symbol} DD` };
  })];
}

function renderLineChart(id, seriesData, options = {}) {
  const svg = document.getElementById(id);
  const width = 760;
  const height = id === "equityChart" ? 300 : 260;
  const pad = 32;
  const pointsData = seriesData.map(item => typeof item === 'number' ? { value: item } : item);
  const values = pointsData.map(item => item.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = Math.max(max - min, 1);
  const points = pointsData.map((item, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((item.value - min) / spread) * (height - pad * 2);
    return { x, y, ...item };
  });
  const zeroY = height - pad - ((0 - min) / spread) * (height - pad * 2);
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${pad},${zeroY} ${line} ${width - pad},${zeroY}`;
  const last = points.at(-1);
  svg.innerHTML = `
    <line class="grid-line" x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}"></line>
    <text class="axis-label" x="${pad}" y="${pad - 10}">${formatR(max)}</text>
    <line class="zero-line" x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}"></line>
    <text class="axis-label" x="${pad}" y="${zeroY - 8}">0R</text>
    <text class="axis-label" x="${pad}" y="${height - 8}">${formatR(min)}</text>
    <polygon class="chart-area" points="${area}" fill="${options.negative ? "#d33f3f" : "#0071e3"}"></polygon>
    <polyline class="chart-line ${options.negative ? "red" : ""}" points="${line}"></polyline>
    ${points.map((p, index) => `<circle class="chart-dot ${index === points.length - 1 ? "last" : ""}" cx="${p.x}" cy="${p.y}" r="${index === points.length - 1 ? 5.5 : 4}"></circle>`).join("")}
    ${last ? `<circle class="chart-pulse" cx="${last.x}" cy="${last.y}" r="11"></circle>` : ""}
  `;

  svg.onmousemove = (e) => {
    const rect = svg.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (width / rect.width);
    let nearest = points[0];
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        nearest = p;
      }
    }
    const tooltip = document.getElementById("chartTooltip");
    if (tooltip && nearest && minDist < 40) {
      const label = nearest.label ? `<strong>${safe(nearest.label)}</strong><br>` : "";
      const detail = nearest.detail ? `<span style="opacity:0.8">${safe(nearest.detail)}</span><br>` : "";
      tooltip.innerHTML = `${label}${detail}Total: <strong>${formatR(nearest.value)}</strong>`;
      const tooltipX = rect.left + (nearest.x / width) * rect.width;
      const tooltipY = rect.top + (nearest.y / height) * rect.height;
      tooltip.style.left = tooltipX + "px";
      tooltip.style.top = tooltipY + "px";
      tooltip.classList.remove("hidden");
    } else if (tooltip) {
      tooltip.classList.add("hidden");
    }
  };

  svg.onmouseleave = () => {
    const tooltip = document.getElementById("chartTooltip");
    if (tooltip) tooltip.classList.add("hidden");
  };
}

function renderInsights() {
  const all = metrics();
  const [weekStart, weekEnd] = weekRange();
  const weekTrades = tradesInRange(weekStart, weekEnd);
  const week = metrics(weekTrades);
  const grouped = Object.entries(groupBy(closedTrades(), "setup")).map(([name, list]) => ({ name, ...metrics(list) }));
  const bestSetup = grouped.sort((a, b) => b.expectancy - a.expectancy)[0];
  const worstSetup = grouped.sort((a, b) => a.expectancy - b.expectancy)[0];
  const bestTrade = [...closedTrades()].sort((a, b) => rValue(b) - rValue(a))[0];
  const worstTrade = [...closedTrades()].sort((a, b) => rValue(a) - rValue(b))[0];
  const s = streak();
  const cards = [
    ["Week R", formatR(week.totalR), `${week.count} trades this week`, "weekR"],
    ["Current Streak", s.count ? `${s.count} ${s.direction > 0 ? "winning" : "losing"} days` : "No streak", "Based on active trading days", "streak"],
    ["Best Setup", bestSetup ? bestSetup.name : "No data", bestSetup ? formatR(bestSetup.expectancy) : "Add trades", "bestSetup"],
    ["Weakest Setup", worstSetup ? worstSetup.name : "No data", worstSetup ? formatR(worstSetup.expectancy) : "Add trades", "worstSetup"],
    ["Largest Win", bestTrade ? formatR(rValue(bestTrade)) : "0.00R", bestTrade ? bestTrade.symbol : "No trades", "largestWin"],
    ["Largest Loss", worstTrade ? formatR(rValue(worstTrade)) : "0.00R", worstTrade ? worstTrade.symbol : "No trades", "largestLoss"],
    ["Process Leak", `${Math.round(processLeakRate() * 100)}%`, "Rule breaks, C trades, weak checklist", "processLeak"],
    ["Total R", formatR(all.totalR), "All recorded trades", "totalR"]
  ];
  if (openTrades().length) cards.unshift([t("openTrades"), String(openTrades().length), t("reviewPrompt"), ""]);
  document.getElementById("summaryCards").innerHTML = cards.map(([title, value, note, key]) => insightCard(title, value, note, key)).join("");
  document.getElementById("statusGrid").innerHTML = [
    ["Plan", state.dailyPlans[todayISO()] ? "Ready" : "Missing", "Pre-market plan"],
    ["Open", `${openTrades(byDate(todayISO())).length}`, "In-progress trades"],
    ["Closed", `${closedByDate(todayISO()).length}`, "Completed today"],
    ["Review", state.dailyReviews[todayISO()] ? "Done" : "Pending", "Daily close"],
  ].map(([title, value, note]) => `<article class="status-card"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join("");
}

function insightCard(title, value, note, insightKey = "") {
  const num = String(value);
  const klass = num.startsWith("-") ? "negative" : num.startsWith("+") ? "positive" : "";
  const clickAttr = insightKey ? ` data-insight="${safe(insightKey)}" style="cursor:pointer;"` : "";
  return `<article class="insight-card"${clickAttr}><span>${safe(title)}</span><strong class="value ${klass}">${safe(value)}</strong><small>${safe(note)}</small></article>`;
}

function renderJournal() {
  const filter = document.getElementById("setupFilter").value;
  const scoped = visibleTrades();
  const filtered = filter === "All" ? scoped : scoped.filter((trade) => trade.setup === filter);
  const open = openTrades(filtered).slice().sort((a, b) => b.date.localeCompare(a.date));
  const closed = closedTrades(filtered).slice().sort((a, b) => (b.closedAt || b.date).localeCompare(a.closedAt || a.date));
  document.getElementById("openTradeCards").innerHTML = open.length ? open.map(tradeCard).join("") : emptyState(t("noOpenTrades"));
  document.getElementById("tradeRows").innerHTML = closed.map(tradeRow).join("");
  document.getElementById("mobileTradeCards").innerHTML = closed.map(tradeCard).join("");
}

function renderSopJourney() {
  const active = activeSop();
  if (!active) return;
  const account = activeAccount();
  const progress = sopProgress(active.id);
  const level = sopLevel(progress);
  setText("activeSopTitle", active.name);
  setText("activeJourneyMeta", `${accountLabel(account)} | ${progress.records} records in this account`);
  setText("activeAccountBalance", money(account?.currentBalance ?? account?.startingBalance ?? 0));
  setText("activeAccountName", accountLabel(account));
  document.getElementById("sopCards").innerHTML = state.sops.filter((sop) => !sop.archivedAt).map((sop) => {
    const sopProgressValue = sopProgress(sop.id);
    const sopLevelValue = sopLevel(sopProgressValue);
    return `<button class="sop-card ${sop.id === state.activeSopId ? "active" : ""}" data-sop="${safe(sop.id)}" type="button">
      <span>${safe(sop.market || "SOP")} · ${safe(sop.timeframe || "Journey")}</span>
      <strong>${safe(sop.name)}</strong>
      <small>Level ${sopLevelValue.level} ${sopLevelValue.name} · ${sopProgressValue.records} records</small>
      <i style="width:${Math.min(100, sopLevelValue.level * 20)}%"></i>
    </button>`;
  }).join("");
  document.getElementById("sopGrowthPanel").innerHTML = maturityPanel(active, progress, level);
  renderAccountManager();
  renderSopTimeline();
  document.querySelectorAll("[data-journal-view]").forEach((button) => button.classList.toggle("active", button.dataset.journalView === journalView));
  document.getElementById("sopTimeline").classList.toggle("hidden", journalView !== "timeline");
  document.getElementById("journalTablePanel").classList.toggle("hidden", journalView !== "table");
}

function maturityPanel(sop, progress, level) {
  const percent = maturityPercent(progress, level);
  const message = progress.records
    ? `${sop.name} is becoming clearer. Keep collecting clean evidence.`
    : "Start with one clean record. The SOP will get clearer quietly.";
  const why = [
    `${progress.records} records captured in this account`,
    `${progress.closed} closed trades available for review`,
    `${progress.screenshots} screenshot${progress.screenshots === 1 ? "" : "s"} / chart evidence`,
    `${Math.round(progress.ruleRate * 100)}% rule-follow rate`
  ];
  return `<article class="maturity-card">
    <div>
      <span class="tag info">SOP Maturity</span>
      <h3>Level ${level.level} · ${safe(level.name)}</h3>
      <p>${safe(message)}</p>
    </div>
    <div class="maturity-meter" aria-label="SOP maturity ${percent}%">
      <i style="width:${percent}%"></i>
    </div>
    <details class="mini-disclosure">
      <summary>Why this level?</summary>
      <ul>${why.map((item) => `<li>${safe(item)}</li>`).join("")}</ul>
      <p>${safe(sopUpgradeSuggestion(sop.id))}</p>
    </details>
  </article>`;
}

function maturityPercent(progress, level) {
  const thresholds = [0, 10, 25, 50, 100];
  const current = thresholds[level.level - 1] || 0;
  const next = thresholds[level.level] || Math.max(progress.records, 100);
  const levelBase = (level.level - 1) * 20;
  const inLevel = Math.min(1, Math.max(0, (progress.records - current) / Math.max(next - current, 1)));
  return Math.round(Math.min(100, levelBase + inLevel * 20));
}

function renderAccountManager() {
  const target = document.getElementById("accountManagerPanel");
  if (!target) return;
  const accounts = accountsForSop().filter((account) => !account.archivedAt);
  target.innerHTML = accounts.map((account) => `
    <article class="account-card ${account.id === state.activeAccountId ? "active" : ""}">
      <button class="account-select" data-account="${safe(account.id)}" type="button">
        <span>${safe(account.type || "Account")}</span>
        <strong>${safe(account.name)}</strong>
        <small>${money(account.currentBalance)} current · ${money(account.startingBalance)} start</small>
      </button>
      <button class="text-button" data-edit-account="${safe(account.id)}" type="button">Edit</button>
    </article>
  `).join("") || emptyState("No accounts yet.");
}

function renderSopTimeline() {
  const target = document.getElementById("sopTimeline");
  if (!target) return;
  const groups = timelineGroups(visibleTrades());
  const days = Object.keys(groups);
  if (!days.length) {
    target.innerHTML = emptyState("No records in this SOP yet.");
    return;
  }
  target.innerHTML = days.map((day) => `
    <section class="timeline-day">
      <div class="timeline-date"><strong>${safe(new Date(`${day}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" }))}</strong><span>${groups[day].length} records</span></div>
      <div class="timeline-records">${groups[day].map(timelineCard).join("")}</div>
    </section>
  `).join("");
}

function timelineCard(trade) {
  const img = imageFor(trade);
  return `<article class="timeline-card ${trade.status === "open" ? "open" : ""}">
    <div>
      <div class="timeline-card-head">
        <strong>${safe(trade.symbol)} ${safe(trade.direction)}</strong>
        ${resultTag(trade)}
      </div>
      <p>${safe(trade.setup)} · ${safe(accountName(trade.accountId))}</p>
    </div>
    <div class="timeline-evidence">
      ${img ? `<img class="thumbnail" src="${img}" alt="Chart screenshot" />` : ""}
      ${trade.tradingViewUrl ? '<span class="tag info">TV</span>' : ""}
      <span class="tag">${safe(trade.grade)}</span>
      <span class="tag ${trade.rule ? "good" : "bad"}">${trade.rule ? "Followed" : "Broken"}</span>
    </div>
    <div class="muted" style="margin:8px 0; font-size:0.88rem; line-height:1.5;">${parseMarkdown(safe(trade.status === "open" ? trade.entryPlan || "In progress" : trade.exitNote || trade.note || "Record completed."))}</div>
    <div class="row-actions">
      <button class="text-button" data-detail="${trade.id}">View</button>
      <button class="text-button" data-edit="${trade.id}">${trade.status === "open" ? "Update" : "Edit"}</button>
      ${trade.status === "open" ? `<button class="text-button" data-close-trade="${trade.id}">Close Trade</button>` : ""}
      <button class="delete-button" data-delete="${trade.id}">Delete</button>
    </div>
  </article>`;
}

function renderTodayOpenTrades() {
  const target = document.getElementById("todayOpenTradeCards");
  if (!target) return;
  const open = openTrades(byDate(todayISO())).slice().sort((a, b) => b.date.localeCompare(a.date));
  target.innerHTML = open.length ? open.map(tradeCard).join("") : emptyState(t("noOpenTrades"));
}

function renderReviewInsightCards() {
  const closed = closedTrades();
  const target = document.getElementById("reviewInsightCards");
  if (!target) return;
  const sop = activeSop();
  const progress = sopProgress(sop?.id);
  const level = sopLevel(progress);
  if (!closed.length) {
    target.innerHTML = [
      insightCard("Working", sop?.name || t("noData"), "Start collecting evidence for this SOP."),
      insightCard("Weakness", "Not enough records", "Close trades to reveal patterns."),
      insightCard("Upgrade", "Add first example", "Screenshot one clean execution.")
    ].join("");
    return;
  }
  const setupRows = Object.entries(groupBy(closed, "setup")).map(([name, list]) => ({ name, ...metrics(list) }));
  const emotionRows = Object.entries(groupBy(closed, "emotion")).map(([name, list]) => ({ name, ...metrics(list) }));
  const bestSetup = [...setupRows].sort((a, b) => b.expectancy - a.expectancy)[0];
  const weakestEmotion = [...emotionRows].sort((a, b) => a.expectancy - b.expectancy)[0];
  const leak = processLeakRate(closed);
  const openCount = openTrades().length;
  const next = openCount
    ? [t("nextFocus"), `${openCount} ${t("open")}`, t("reviewPrompt")]
    : leak > 0.25
      ? [t("nextFocus"), "Process first", "Reduce rule breaks before adding size."]
      : [t("nextFocus"), bestSetup?.name || "Repeat quality", "Only trade the setup with the cleanest evidence."];
  target.innerHTML = [
    insightCard("Working", bestSetup?.name || sop?.name || t("noData"), `Level ${level.level} ${level.name} · ${formatR(progress.expectancy)} expectancy`),
    insightCard("Weakness", sopWeaknessProfile(sop?.id), weakestEmotion ? `${weakestEmotion.name} impact ${formatR(weakestEmotion.expectancy)}` : `${Math.round(leak * 100)}% ${t("processLeak")}`),
    insightCard("Upgrade", sopUpgradeSuggestion(sop?.id), `${progress.screenshots} screenshots · ${Math.round(progress.ruleRate * 100)}% rule follow`)
  ].join("");
}

function tradeRow(trade) {
  const r = rValue(trade);
  return `<tr>
    <td>${safe(trade.date)}</td>
    <td>${safe(trade.symbol)} ${trade.direction === "Long" ? "up" : "down"}</td>
    <td>${safe(trade.setup)}</td>
    <td>${resultTag(trade)}</td>
    <td>${safe(trade.grade)}</td>
    <td>${trade.rule ? "Yes" : "No"}</td>
    <td>${mediaBadges(trade)}</td>
    <td><div class="row-actions">
      <button class="text-button" data-detail="${trade.id}">View</button>
      <button class="text-button" data-edit="${trade.id}">Edit</button>
      <button class="delete-button" data-delete="${trade.id}">Delete</button>
    </div></td>
  </tr>`;
}

function tradeCard(trade) {
  const img = imageFor(trade);
  return `<article class="trade-card">
    <div class="trade-card-head"><div><strong>${safe(trade.symbol)} ${safe(trade.direction)}</strong><p>${safe(trade.date)} | ${safe(trade.setup)}</p></div>${resultTag(trade)}</div>
    <div class="trade-card-meta"><span>${trade.status === "open" ? safe(trade.entryPlan || "In progress") : `Grade ${safe(trade.grade)} | Rule ${trade.rule ? "Yes" : "No"}`}</span>${img ? `<img class="thumbnail" src="${img}" alt="Chart screenshot" />` : ""}</div>
    <div class="row-actions"><button class="text-button" data-detail="${trade.id}">View</button><button class="text-button" data-edit="${trade.id}">${trade.status === "open" ? "Update" : "Edit"}</button>${trade.status === "open" ? `<button class="text-button" data-close-trade="${trade.id}">Close Trade</button>` : ""}<button class="delete-button" data-delete="${trade.id}">Delete</button></div>
  </article>`;
}

function resultTag(trade) {
  if (trade.status === "open") return '<span class="tag info">Open</span>';
  const r = rValue(trade);
  return `<span class="tag ${r >= 0 ? "good" : "bad"}">${formatR(r)}</span>`;
}

function mediaBadges(trade) {
  const imgCount = imagesFor(trade).length;
  const imgBadge = imgCount > 1 ? `<span class="tag info">${imgCount} Images</span> ` : imgCount === 1 ? '<span class="tag info">Image</span> ' : "";
  return `${imgBadge}${trade.tradingViewUrl ? '<span class="tag info">TV</span>' : ""}` || '<span class="muted">None</span>';
}

function imageFor(trade) {
  return trade.imageData || trade.imageUrl || "";
}

function renderAnalytics() {
  renderGroupedBars("setupBars", groupBy(closedTrades(), "setup"));
  renderGroupedBars("emotionBars", groupBy(closedTrades(), "emotion"));
  renderGroupedBars("gradeBars", groupBy(closedTrades(), "grade"));
  
  const weekdays = closedTrades().reduce((acc, trade) => {
    const d = new Date(`${trade.date}T12:00:00`);
    const day = d.toLocaleDateString("en", { weekday: "short" });
    if (!acc[day]) acc[day] = [];
    acc[day].push(trade);
    return acc;
  }, {});
  renderGroupedBars("weekdayBars", weekdays);
  renderGroupedBars("directionBars", groupBy(closedTrades(), "direction"));
  
  renderDistribution();
}

function renderGroupedBars(id, grouped) {
  const rows = Object.entries(grouped).map(([name, list]) => ({ name, list, ...metrics(list) })).sort((a, b) => b.expectancy - a.expectancy);
  if (!rows.length) {
    document.getElementById(id).innerHTML = emptyState("No data yet.");
    return;
  }
  const max = Math.max(...rows.map((row) => Math.abs(row.expectancy)), 1);
  document.getElementById(id).innerHTML = rows.map((row) => `
    <div class="bar-row">
      <strong>${safe(row.name)}</strong>
      <div class="bar-track"><div class="bar-fill ${row.expectancy < 0 ? "negative" : ""}" style="width:${Math.max(Math.abs(row.expectancy) / max * 100, 6)}%"></div></div>
      <span>${formatR(row.expectancy)} | ${row.count} | ${Math.round(row.winRate * 100)}%</span>
    </div>
  `).join("");
}

function renderDistribution() {
  const bins = [-2, -1, -0.5, 0, 0.5, 1, 2, Infinity];
  const labels = ["<-2", "-2/-1", "-1/-.5", "-.5/0", "0/.5", ".5/1", "1/2", ">2"];
  const counts = Array(labels.length).fill(0);
  closedTrades().forEach((trade) => {
    const r = rValue(trade);
    const index = bins.findIndex((bin) => r <= bin);
    counts[Math.max(index, 0)] += 1;
  });
  const max = Math.max(...counts, 1);
  document.getElementById("distributionChart").innerHTML = counts.map((count, index) => `
    <div class="histogram-bar" style="height:${40 + count / max * 170}px"><strong>${count}</strong><span>${labels[index]}</span></div>
  `).join("");
}

function renderWorkflow() {
  const day = selectedDay || todayISO();
  const tradesToday = byDate(day);
  const closedToday = closedByDate(day);
  const plan = state.dailyPlans[day];
  const review = state.dailyReviews[day];
  const status = [
    ["Plan ready", plan ? "Yes" : "No", plan?.bias || "Save a pre-market plan."],
    ["Open trades", String(openTrades(tradesToday).length), "In-progress execution"],
    ["Closed", String(closedToday.length), `${formatR(metrics(closedToday).totalR)} selected day`],
    ["Checklist quality", `${Math.round((1 - processLeakRate(closedToday)) * 100)}%`, "Closed trade quality"],
    ["Review", review ? "Complete" : "Pending", review?.focus || "Close the loop after session"]
  ];
  document.getElementById("workflowStatus").innerHTML = status.map(([title, value, note]) => insightCard(title, value, note)).join("");
}

function renderCycles() {
  const [monthStart, monthEnd] = monthRange(selectedDay);
  const first = new Date(`${monthStart}T00:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const days = dateRange(monthStart, monthEnd);
  document.getElementById("calendarTitle").textContent = first.toLocaleDateString("en", { month: "long", year: "numeric" });
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="calendar-label">${d}</div>`).join("");
  const blanks = Array(offset).fill('<button class="calendar-day empty" disabled></button>').join("");
  const cells = days.map((day) => {
    const m = metrics(closedByDate(day));
    const openCount = openTrades(byDate(day)).length;
    const review = state.dailyReviews[day] ? "Review done" : "";
    let klass = "";
    if (m.totalR >= 3) klass = "positive-3";
    else if (m.totalR >= 1) klass = "positive-2";
    else if (m.totalR > 0) klass = "positive-1";
    else if (m.totalR <= -3) klass = "negative-3";
    else if (m.totalR <= -1) klass = "negative-2";
    else if (m.totalR < 0) klass = "negative-1";
    return `<button class="calendar-day ${klass} ${day === selectedDay ? "selected" : ""}" data-day="${day}">
      <strong>${Number(day.slice(-2))}</strong>
      <span>${m.count ? formatR(m.totalR) : openCount ? `${openCount} open` : "No trade"}</span>
      <small>${m.count ? `${m.count} closed${openCount ? ` | ${openCount} open` : ""}` : review}</small>
    </button>`;
  }).join("");
  document.getElementById("calendarGrid").innerHTML = labels + blanks + cells;
  renderDayDetail(selectedDay);
  renderCycleSummaries();
}

function renderDayDetail(day) {
  const trades = byDate(day);
  const closed = closedByDate(day);
  const plan = state.dailyPlans[day];
  const review = state.dailyReviews[day];
  document.getElementById("dayDetailTitle").textContent = new Date(`${day}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  document.getElementById("dayDetail").innerHTML = `
    ${insightCard("Day R", formatR(metrics(closed).totalR), `${closed.length} closed | ${openTrades(trades).length} open`)}
    <div class="day-trade"><strong>Plan</strong><p>${safe(plan?.bias || "No plan saved.")}</p><p>${safe(plan?.levels || "")}</p></div>
    <div class="day-trade"><strong>Review</strong><p>${safe(review?.focus || "No review saved.")}</p></div>
    ${trades.map((trade) => `<div class="day-trade"><strong>${safe(trade.symbol)} ${trade.status === "open" ? "Open" : formatR(rValue(trade))}</strong><p>${safe(trade.setup)} | ${safe(trade.status === "open" ? trade.entryPlan || "In progress" : trade.emotion)}</p>${trade.tradingViewUrl ? `<a href="${safe(trade.tradingViewUrl)}" target="_blank" rel="noreferrer">Open Chart</a>` : ""}</div>`).join("")}
  `;
}

function renderCycleSummaries() {
  const [weekStart, weekEnd] = weekRange(selectedDay);
  const [monthStart, monthEnd] = monthRange(selectedDay);
  const weekTrades = tradesInRange(weekStart, weekEnd);
  const monthTrades = tradesInRange(monthStart, monthEnd);
  document.getElementById("weeklySummary").innerHTML = summaryCardsFor(weekTrades, weekStart, weekEnd).join("");
  document.getElementById("monthlySummary").innerHTML = monthlyCards(monthTrades, monthStart, monthEnd).join("");
}

function summaryCardsFor(trades, start, end) {
  const m = metrics(trades);
  const setups = Object.entries(groupBy(trades, "setup")).map(([name, list]) => ({ name, ...metrics(list) }));
  const best = setups.sort((a, b) => b.expectancy - a.expectancy)[0];
  const weak = setups.sort((a, b) => a.expectancy - b.expectancy)[0];
  return [
    insightCard("Period", `${start.slice(5)} - ${end.slice(5)}`, `${trades.length} trades`),
    insightCard("Total R", formatR(m.totalR), `${Math.round(m.winRate * 100)}% win rate`),
    insightCard("Best Setup", best?.name || "No data", best ? formatR(best.expectancy) : "Add trades"),
    insightCard("Weakest Setup", weak?.name || "No data", weak ? formatR(weak.expectancy) : "Add trades"),
    insightCard("Process Leak", `${Math.round(processLeakRate(trades) * 100)}%`, "Lower is better")
  ];
}

function monthlyCards(trades, start, end) {
  const days = dateRange(start, end);
  const activeDays = days.filter((day) => byDate(day).length || closedByDate(day).length);
  const dayStats = activeDays.map((day) => ({ day, totalR: metrics(closedByDate(day)).totalR }));
  const best = [...dayStats].sort((a, b) => b.totalR - a.totalR)[0];
  const worst = [...dayStats].sort((a, b) => a.totalR - b.totalR)[0];
  const reviews = days.filter((day) => state.dailyReviews[day]).length;
  return [
    ...summaryCardsFor(trades, start, end).slice(0, 2),
    insightCard("Active Days", String(activeDays.length), "Days with trades"),
    insightCard("Best Day", best ? formatR(best.totalR) : "0.00R", best?.day || "No data"),
    insightCard("Worst Day", worst ? formatR(worst.totalR) : "0.00R", worst?.day || "No data"),
    insightCard("Review Rate", `${Math.round(reviews / Math.max(activeDays.length, 1) * 100)}%`, "Reviewed active days")
  ];
}

function renderPlaybook() {
  document.getElementById("playbookGrid").innerHTML = state.sops.map((sop) => {
    const progress = sopProgress(sop.id);
    const level = sopLevel(progress);
    
    const trades = sopTrades(sop.id);
    const closed = closedTrades(trades);
    const sparklineHtml = drawMiniSparklineMarkup(closed);
    
    return `
    <div class="sop-card-container" id="container-${sop.id}">
      <div class="sop-card-inner">
        <!-- Front Face -->
        <div class="sop-card-front">
          <button class="card-flip-btn" onclick="flipCard('${sop.id}')" title="Flip to rules" aria-label="Flip card">🔄</button>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <span class="tag info" style="width:fit-content; margin-bottom:4px;">Level ${level.level} ${level.name}</span>
            <strong style="font-size:18px; line-height:1.2;">${safe(sop.name)}</strong>
            <span style="font-size:12px; color:var(--muted);">${safe(sop.market)} · ${safe(sop.timeframe)} · ${progress.records} records</span>
          </div>
          
          <div class="mini-sparkline-container">
            ${sparklineHtml}
          </div>
          
          <div class="sop-card-stat-row">
            <div class="sop-card-stat">
              <span>Win Rate</span>
              <strong>${Math.round(progress.winRate * 100)}%</strong>
            </div>
            <div class="sop-card-stat">
              <span>Expectancy</span>
              <strong class="${progress.expectancy >= 0 ? 'pos' : 'neg'}">${formatR(progress.expectancy)}</strong>
            </div>
            <div class="sop-card-stat">
              <span>Total R</span>
              <strong class="${progress.totalR >= 0 ? 'pos' : 'neg'}">${formatR(progress.totalR)}</strong>
            </div>
          </div>
        </div>
        
        <!-- Back Face -->
        <div class="sop-card-back">
          <button class="card-flip-btn" onclick="flipCard('${sop.id}')" title="Flip to stats" aria-label="Flip card">🔄</button>
          <div style="display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex-grow:1; margin-bottom:12px; padding-right:4px;">
            <strong style="font-size:14px; color:var(--muted);">Checklist & Rules</strong>
            <ul style="margin: 0; padding-left: 18px; font-size:12px; line-height:1.4;">
              ${(sop.checklist || []).slice(0, 4).map((item) => `<li>${safe(item)}</li>`).join("")}
              ${(sop.checklist || []).length > 4 ? `<li>+${(sop.checklist || []).length - 4} more</li>` : ""}
            </ul>
            ${sop.entryRules ? `<div style="font-size:11px; opacity:0.85; border-top:1px solid var(--hairline); padding-top:6px;"><strong>Entry:</strong> ${safe(sop.entryRules)}</div>` : ''}
            ${sop.weaknesses && sop.weaknesses.length ? `<div style="font-size:11px; opacity:0.85; border-top:1px solid var(--hairline); padding-top:6px; color:var(--red);"><strong>Weakness:</strong> ${safe(sop.weaknesses[0])}</div>` : ''}
          </div>
          <div class="row-actions" style="margin-top:auto; border-top:1px solid var(--hairline); padding-top:10px;">
            <button class="text-button" data-edit-sop="${safe(sop.id)}">Edit</button>
            <button class="text-button" data-add-account="${safe(sop.id)}">Add Account</button>
            <button class="text-button danger" data-delete-sop="${safe(sop.id)}">Delete</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

function deleteSop(id) {
  const sop = state.sops.find((s) => s.id === id);
  if (!sop) return;
  const tradeCount = state.trades.filter((t) => t.sopId === id).length;
  const msg = tradeCount
    ? `Delete SOP "${sop.name}" and its ${tradeCount} trade(s)? This cannot be undone.`
    : `Delete SOP "${sop.name}"? This cannot be undone.`;
  if (!confirm(msg)) return;
  state.trades = state.trades.filter((t) => t.sopId !== id);
  state.accounts = state.accounts.filter((a) => a.sopId !== id);
  state.sops = state.sops.filter((s) => s.id !== id);
  if (state.activeSopId === id) {
    state.activeSopId = state.sops[0]?.id || "";
    state.activeAccountId = accountsForSop(state.activeSopId)[0]?.id || "";
  }
  saveState();
  renderAll();
  toast(`SOP "${sop.name}" deleted.`, "delete");
}

function openSopModal(id = "") {
  const sop = state.sops.find((item) => item.id === id) || {};
  openModal(id ? "Edit SOP" : "Add SOP", "SOP Library", `
    <form class="sop-editor-form" id="sopEditorForm" data-sop-id="${safe(id)}">
      <div class="form-row">
        <label>SOP Name<input name="name" required value="${safe(sop.name || "")}" placeholder="Opening Drive SOP" /></label>
        <label>Market<input name="market" value="${safe(sop.market || "Futures")}" placeholder="Futures / Forex / Crypto" /></label>
      </div>
      <div class="form-row">
        <label>Timeframe<input name="timeframe" value="${safe(sop.timeframe || "Intraday")}" /></label>
        <label>Status<select name="status"><option ${sop.status !== "archived" ? "selected" : ""}>active</option><option ${sop.status === "archived" ? "selected" : ""}>archived</option></select></label>
      </div>
      <label>Entry Rules<textarea name="entryRules" rows="3">${safe(sop.entryRules || defaultSopDetails.entryRules)}</textarea></label>
      <label>Exit Rules<textarea name="exitRules" rows="3">${safe(sop.exitRules || defaultSopDetails.exitRules)}</textarea></label>
      <label>Risk Rules<textarea name="riskRules" rows="3">${safe(sop.riskRules || defaultSopDetails.riskRules)}</textarea></label>
      <label>No-trade Rules<textarea name="noTradeRules" rows="3">${safe(sop.noTradeRules || defaultSopDetails.noTradeRules)}</textarea></label>
      <label>Checklist<textarea name="checklist" rows="4">${safe((sop.checklist || defaultSopDetails.checklist).join("\n"))}</textarea></label>
      <label>Weaknesses<textarea name="weaknesses" rows="4">${safe((sop.weaknesses || defaultSopDetails.weaknesses).join("\n"))}</textarea></label>
      <button class="primary-button" type="submit">Save SOP</button>
    </form>
  `);
}

function openAccountModal(sopId = state.activeSopId, accountId = "") {
  const account = state.accounts.find((item) => item.id === accountId) || {};
  openModal(accountId ? "Edit Account" : "Add Account", "Account", `
    <form class="sop-editor-form" id="accountEditorForm" data-sop-id="${safe(sopId)}" data-account-id="${safe(accountId)}">
      <label>Account Name<input name="name" required value="${safe(account.name || "")}" placeholder="ACC 1 / Prop Phase 1 / Funded" /></label>
      <label>Type<input name="type" value="${safe(account.type || "")}" placeholder="Demo, Personal, Prop, Funded" /></label>
      <div class="form-row">
        <label>Starting Balance ($)<input name="startingBalance" type="number" min="0" step="1" value="${safe(account.startingBalance ?? 1000)}" /></label>
        <label>Current Balance ($)<input name="currentBalance" type="number" min="0" step="1" value="${safe(account.currentBalance ?? account.startingBalance ?? 1000)}" /></label>
      </div>
      <button class="primary-button" type="submit">Save Account</button>
    </form>
  `);
}

function saveSopFromModal(event) {
  event.preventDefault();
  const form = event.target;
  const existing = state.sops.find((sop) => sop.id === form.dataset.sopId);
  const id = existing?.id || makeSopId(form.name.value);
  const sop = {
    id,
    name: form.name.value.trim() || "Untitled SOP",
    market: form.market.value.trim() || "Futures",
    timeframe: form.timeframe.value.trim() || "Intraday",
    status: form.status.value,
    levelNotes: existing?.levelNotes || "",
    entryRules: form.entryRules.value.trim(),
    exitRules: form.exitRules.value.trim(),
    riskRules: form.riskRules.value.trim(),
    noTradeRules: form.noTradeRules.value.trim(),
    checklist: form.checklist.value.split("\n").map((item) => item.trim()).filter(Boolean),
    weaknesses: form.weaknesses.value.split("\n").map((item) => item.trim()).filter(Boolean),
    createdAt: existing?.createdAt || todayISO(),
    archivedAt: form.status.value === "archived" ? existing?.archivedAt || todayISO() : ""
  };
  if (existing) state.sops[state.sops.findIndex((item) => item.id === existing.id)] = sop;
  else {
    state.sops.push(sop);
    state.accounts.push({ id: makeAccountId(id, "Main Account"), sopId: id, name: "Main Account", type: "Main", startingBalance: 1000, currentBalance: 1000, status: "active", createdAt: todayISO(), archivedAt: "" });
  }
  state.activeSopId = id;
  state.activeAccountId = accountsForSop(id)[0]?.id || state.activeAccountId;
  saveState();
  closeModal();
  renderAll();
  toast(`${sop.name} SOP saved.`);
}

function saveAccountFromModal(event) {
  event.preventDefault();
  const form = event.target;
  const sopId = form.dataset.sopId || state.activeSopId;
  const existing = state.accounts.find((account) => account.id === form.dataset.accountId);
  const account = {
    id: existing?.id || makeAccountId(sopId, form.name.value),
    sopId,
    name: form.name.value.trim(),
    type: form.type.value.trim() || "Account",
    startingBalance: Number(form.startingBalance.value || 0),
    currentBalance: Number(form.currentBalance.value || form.startingBalance.value || 0),
    status: existing?.status || "active",
    createdAt: existing?.createdAt || todayISO(),
    archivedAt: existing?.archivedAt || ""
  };
  if (existing) state.accounts[state.accounts.findIndex((item) => item.id === existing.id)] = account;
  else state.accounts.push(account);
  state.activeSopId = sopId;
  state.activeAccountId = account.id;
  saveState();
  closeModal();
  renderAll();
  toast(`${account.name} account saved.`);
}

function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll(".language-toggle").forEach((button) => {
    button.setAttribute("aria-label", language === "zh" ? "Switch to English" : "切换到华文");
    button.innerHTML = `
      <span class="${language === "en" ? "active" : ""}">EN</span>
      <span class="${language === "zh" ? "active" : ""}">中文</span>
    `;
  });
  const homeTitle = document.querySelector(".home-hero h1");
  const homeCopy = document.querySelector(".home-copy");
  if (homeTitle) homeTitle.textContent = t("homeTitle");
  if (homeCopy) homeCopy.textContent = t("homeCopy");
  const cards = [
    ["overview", t("today")],
    ["journal", t("journal")],
    ["review", t("review")],
    ["settings", t("system")]
  ];
  cards.forEach(([id, label]) => {
    const cardLabel = document.querySelector(`[data-open-module="${id}"] span`);
    const view = document.getElementById(id);
    if (cardLabel) cardLabel.textContent = label;
    if (view) view.dataset.title = label;
  });
  const back = document.getElementById("backHomeBtn");
  if (back) back.textContent = t("back");
  const action = document.querySelector(".module-action");
  if (action) action.textContent = t("logTrade");
  if (activeModule) {
    const view = document.getElementById(activeModule);
    setText("moduleTitle", view?.dataset.title || t("today"));
  }
  translatePageText();
}

function translatePageText() {
  const pairs = [
    ["Command Center", "交易控制台"], ["Execution", "执行"], ["Evidence", "证据"], ["Preferences", "偏好"],
    ["Equity", "权益"], ["R-based journey", "R 值曲线"], ["This week", "本周"], ["Operating status", "运行状态"],
    ["Expectancy", "期望值"], ["Average edge per trade", "每笔平均优势"], ["Win Rate", "胜率"], ["Wins / closed trades", "盈利 / 已完成交易"],
    ["Profit Factor", "盈亏比"], ["Gross wins / gross losses", "总盈利 / 总亏损"], ["Max Drawdown", "最大回撤"], ["Peak-to-trough in R", "按 R 计算的峰谷回撤"],
    ["Pre-market", "盘前"], ["Plan today", "今日计划"], ["Workflow Date", "记录日期"], ["Market Bias", "市场倾向"], ["Key Levels", "关键价位"], ["Allowed Setups", "允许形态"],
    ["Max Loss (R)", "最大亏损 (R)"], ["Max Trades", "最大交易数"], ["Save Plan", "保存计划"],
    ["Daily close", "日终"], ["Review the day", "复盘当天"], ["Keep", "保留"], ["Remove", "移除"], ["Save Review", "保存复盘"],
    ["Open Trades", "进行中交易"], ["Live execution", "执行中"], ["In progress", "进行中"], ["Closed Trades", "已完成交易"], ["Completed records", "完成记录"],
    ["Open trade", "进行中交易"], ["Start trade", "开始交易"], ["Date", "日期"], ["Symbol", "品种"], ["Setup", "形态"], ["Direction", "方向"], ["Risk ($)", "风险 ($)"],
    ["Account", "账户"], ["Current Balance", "当前资金"], ["SOP Journey", "SOP 旅程"], ["SOP Library", "SOP 库"], ["Add Account", "添加账户"], ["Add SOP", "添加 SOP"],
    ["Edit Balance", "编辑资金"],
    ["Capture Trade", "记录交易"], ["SOP Maturity", "SOP 成熟度"], ["Why this level?", "为什么是这个等级？"], ["Starting Balance ($)", "起始资金 ($)"], ["Current Balance ($)", "当前资金 ($)"],
    ["Entry Plan", "入场计划"], ["Stop Plan", "止损计划"], ["Target Plan", "目标计划"], ["Close or add details", "结束或补充细节"],
    ["Grade", "评分"], ["Net P&L ($)", "净盈亏 ($)"], ["Rule followed", "遵守规则"], ["Emotion", "情绪"], ["TradingView Link", "TradingView 链接"],
    ["Chart Image URL", "图表图片链接"], ["Upload Screenshot", "上传截图"], ["Exit Note", "出场记录"], ["General Note", "一般备注"],
    ["Review", "复盘"], ["Current read", "当前解读"],
    ["Insights", "洞察"], ["Charts", "图表"], ["Calendar", "日历"], ["Playbook", "交易手册"], ["Drawdown", "回撤"], ["Risk pressure", "风险压力"],
    ["Distribution", "分布"], ["R multiple spread", "R 倍数分布"], ["Setups", "形态"], ["Performance by setup", "按形态表现"],
    ["Behavior", "行为"], ["Emotion impact", "情绪影响"], ["Quality", "质量"], ["Grade breakdown", "评分拆解"],
    ["Day detail", "当天详情"], ["Select a day", "选择日期"], ["Weekly", "每周"], ["Cycle summary", "周期摘要"], ["Monthly", "每月"], ["Consistency", "一致性"],
    ["Personal system", "个人系统"], ["Default Symbol", "默认品种"], ["Risk Per Trade ($)", "每笔风险 ($)"], ["Daily Max Loss (R)", "每日最大亏损 (R)"],
    ["Max Trades Per Day", "每日最大交易数"], ["Daily Rules", "每日规则"], ["Save Preferences", "保存偏好"], ["Data", "数据"], ["Backup and restore", "备份与恢复"],
    ["Import", "导入"], ["Backup", "备份"], ["Reset Demo", "重置演示"], ["Start Trade", "开始记录"], ["Update", "更新"], ["Edit", "编辑"], ["Delete", "删除"], ["View", "查看"],
    
    // Phase 5 Translations
    ["Backtester", "回测沙盒"],
    ["SOP Backtest Sandbox", "SOP 策略回测沙盒"],
    ["Initial Capital ($)", "初始资金 ($)"],
    ["Risk Mode", "风险模式"],
    ["Risk Value", "风险数值"],
    ["Batch Paste R-Multiples", "批量粘贴 R 倍数"],
    ["Generate Curve", "生成曲线"],
    ["Manual Input", "单笔录入"],
    ["Batch Input", "批量录入"],
    ["R Multiple", "R 倍数"],
    ["Setup Name (Optional)", "形态名称 (可选)"],
    ["Add Trade", "添加模拟"],
    ["Save Run", "保存回测"],
    ["Clear Sandbox", "清空沙盒"],
    ["Mock Trades", "模拟交易列表"],
    ["Backtest Analytics", "回测数据指标"],
    ["Execution Gap", "实盘执行偏差"],
    ["Backtest vs Live Execution", "回测 vs 实盘对比"],
    ["Saved Backtests", "已保存回测历史"],
    ["Import Backup", "导入备份数据"],
    ["Data Manager", "数据管理器"],
    ["Smart Merge (Recommended)", "智能合并数据 (推荐)"],
    ["Full Overwrite Restore", "完全覆盖恢复"],
    ["Projected R-Curve Projection (Dashed: Current / Solid: Merged)", "R 曲线投影对照 (虚线: 当前 / 实线: 合并后)"],
    ["System update ready, click to reload.", "系统更新已就绪，点击立即载入新版本。"],
    ["Update", "更新"]
  ];
  const map = new Map(language === "zh" ? pairs : pairs.map(([en, zh]) => [zh, en]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const trimmed = node.nodeValue.trim();
    if (!map.has(trimmed)) return;
    node.nodeValue = node.nodeValue.replace(trimmed, map.get(trimmed));
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function emptyState(text) {
  return `<p class="muted">${safe(text)}</p>`;
}

async function fileToDataUrl(file) {
  if (!file) return "";
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
  return await compressImage(raw);
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  
  if (type === 'success') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'error') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'switch') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'click') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
    osc.start(now);
    osc.stop(now + 0.03);
  } else if (type === 'win') {
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.04);
      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.3);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.3);
    });
  } else if (type === 'loss') {
    const freqs = [392.00, 311.13, 261.63]; // G4, Eb4, C4
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.06);
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.4);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.4);
    });
  } else if (type === 'flip') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
  } else if (type === 'delete') {
    try {
      const bufferSize = audioCtx.sampleRate * 0.15;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.15);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.15);
    } catch (e) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(60, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }
}

async function compressImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Image could not be loaded."));
  });
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > IMAGE_LIMIT && quality > 0.42) {
    quality -= 0.1;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  if (output.length > IMAGE_LIMIT) throw new Error("Image is too large. Please use a smaller screenshot.");
  return output;
}

function resetTradeForm() {
  const form = document.getElementById("tradeForm");
  form.reset();
  form.elements.id.value = "";
  form.date.value = todayISO();
  form.symbol.value = state.preferences.defaultSymbol;
  form.sopId.value = state.activeSopId;
  populateSopControls();
  form.accountId.value = state.activeAccountId;
  form.risk.value = state.preferences.riskPerTrade;
  form.pnl.value = "";
  form.entryPlan.value = "";
  form.stopPlan.value = "";
  form.targetPlan.value = "";
  form.exitNote.value = "";
  form.note.value = "";
  document.querySelector(".advanced-fields").open = false;
  document.getElementById("tradeFormMode").textContent = "Open trade";
  document.getElementById("saveTradeBtn").textContent = "Start Trade";
  document.getElementById("cancelEditBtn").classList.add("hidden");
}

function editTrade(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (!trade) return;
  const form = document.getElementById("tradeForm");
  form.elements.id.value = trade.id;
  form.date.value = trade.date;
  form.symbol.value = trade.symbol;
  state.activeSopId = trade.sopId || state.activeSopId;
  const account = state.accounts.find((item) => item.id === trade.accountId);
  state.activeAccountId = account?.id || accountsForSop(state.activeSopId)[0]?.id || state.activeAccountId;
  populateSopControls();
  form.sopId.value = state.activeSopId;
  form.accountId.value = state.activeAccountId;
  form.setup.value = trade.setup;
  form.direction.value = trade.direction;
  form.grade.value = trade.grade;
  form.risk.value = trade.risk;
  form.pnl.value = trade.status === "open" ? "" : trade.pnl;
  form.rule.value = String(trade.rule);
  form.emotion.value = trade.emotion;
  form.tradingViewUrl.value = trade.tradingViewUrl || "";
  form.imageUrl.value = trade.imageUrl || "";
  form.entryPlan.value = trade.entryPlan || "";
  form.stopPlan.value = trade.stopPlan || "";
  form.targetPlan.value = trade.targetPlan || "";
  form.exitNote.value = trade.exitNote || "";
  form.note.value = trade.note || "";
  for (const key of Object.keys(trade.checklist || {})) form[key].checked = Boolean(trade.checklist[key]);
  document.querySelector(".advanced-fields").open = trade.status !== "open";
  document.getElementById("tradeFormMode").textContent = trade.status === "open" ? "Update open trade" : "Edit closed trade";
  document.getElementById("saveTradeBtn").textContent = trade.status === "open" ? "Update Trade" : "Save Trade";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  document.getElementById("captureTradeDetails").open = true;
  openModule("journal");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveTradeFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const imagePromises = Array.from(form.imageFile.files).map(file => fileToDataUrl(file));
    const imagesData = (await Promise.all(imagePromises)).filter(Boolean);
    const current = form.elements.id.value ? state.trades.find((trade) => trade.id === form.elements.id.value) : {};
    const hasResult = form.pnl.value.trim() !== "";
    const nextStatus = hasResult ? "closed" : "open";
    const trade = normalizeTrade({
      ...current,
      id: form.elements.id.value || uid(),
      status: nextStatus,
      date: form.date.value,
      closedAt: nextStatus === "closed" ? current.closedAt || form.date.value : "",
      symbol: form.symbol.value.trim().toUpperCase(),
      sopId: form.sopId.value,
      accountId: form.accountId.value,
      setup: form.setup.value,
      direction: form.direction.value,
      grade: form.grade.value,
      risk: Number(form.risk.value),
      pnl: hasResult ? Number(form.pnl.value) : "",
      rule: form.rule.value === "true",
      emotion: form.emotion.value,
      note: form.note.value,
      entryPlan: form.entryPlan.value.trim(),
      stopPlan: form.stopPlan.value.trim(),
      targetPlan: form.targetPlan.value.trim(),
      exitNote: form.exitNote.value.trim(),
      tradingViewUrl: form.tradingViewUrl.value.trim(),
      imageUrl: form.imageUrl.value.trim(),
      images: imagesData.length ? imagesData : (current.images || (current.imageData ? [current.imageData] : [])),
      imageData: "",
      checklist: {
        hasPlan: form.hasPlan.checked,
        hasTrigger: form.hasTrigger.checked,
        hasStop: form.hasStop.checked,
        hasTarget: form.hasTarget.checked,
        emotionControlled: form.emotionControlled.checked
      }
    });
    const index = state.trades.findIndex((item) => item.id === trade.id);
    if (index >= 0) state.trades[index] = trade;
    else state.trades.push(trade);
    state.activeSopId = trade.sopId;
    state.activeAccountId = trade.accountId;
    saveState();
    resetTradeForm();
    renderAll();
    const progress = sopProgress(trade.sopId);
    
    let toastType = "info";
    if (nextStatus === "closed") {
      const isWin = trade.pnl > 0 || (trade.pnl === 0 && rValue(trade) > 0);
      toastType = isWin ? "win" : "loss";
    }
    
    toast(nextStatus === "open" ? `Added to ${sopName(trade.sopId)} journey.` : `Record completed. ${progress.records} records in this SOP.`, toastType);
  } catch (error) {
    toast(error.message, "error");
  }
}

function deleteTrade(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (!trade) return;
  if (!confirm(`Delete ${trade.symbol} ${formatR(rValue(trade))}?`)) return;
  state.trades = state.trades.filter((item) => item.id !== id);
  saveState();
  renderAll();
  toast("Trade deleted.", "delete");
}

function openCloseTradeModal(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (!trade) return;
  openModal("Close trade", "Result", `
    <form class="close-trade-form" id="closeTradeForm" data-close-id="${trade.id}">
      <div class="insight-grid">
        ${insightCard("Symbol", trade.symbol, trade.direction)}
        ${insightCard("Setup", trade.setup, `Risk ${money(trade.risk)}`)}
      </div>
      <div class="form-row">
        <label>Net P&L ($)<input name="pnl" type="number" step="1" placeholder="240" /></label>
        <label>${t("rResult")}<input name="rResult" type="number" step="0.01" placeholder="+1.20" /></label>
      </div>
      <p class="muted">${t("rHint")} ${t("pnlWins")}</p>
      <div class="form-row">
        <label>Rule followed<select name="rule"><option value="true">Yes</option><option value="false">No</option></select></label>
        <label>Emotion<select name="emotion"><option>Calm</option><option>Focused</option><option>FOMO</option><option>Revenge</option><option>Hesitant</option></select></label>
      </div>
      <label>Exit Note
        <div class="markdown-editor-container">
          <div class="md-toolbar">
            <button type="button" class="md-btn" onclick="insertMarkdown(this, '**', '**')" title="Bold">B</button>
            <button type="button" class="md-btn" onclick="insertMarkdown(this, '*', '*')" title="Italic">I</button>
            <button type="button" class="md-btn" onclick="insertMarkdown(this, '==', '==')" title="Highlight">Hi</button>
            <button type="button" class="md-btn" onclick="insertMarkdown(this, '- ', '')" title="List">•</button>
            <button type="button" class="md-btn" onclick="insertMarkdown(this, '> ', '')" title="Quote">"</button>
          </div>
          <textarea name="exitNote" rows="3" placeholder="Why and how the trade ended."></textarea>
        </div>
      </label>
      <label>Upload Screenshot<input name="imageFile" type="file" accept="image/*" /></label>
      <button class="primary-button" type="submit">Close Trade</button>
    </form>
  `);
}

async function closeTradeFromModal(event) {
  event.preventDefault();
  const form = event.target;
  const trade = state.trades.find((item) => item.id === form.dataset.closeId);
  if (!trade) return;
  try {
    const pnlInput = form.pnl.value.trim();
    const rInput = form.rResult.value.trim();
    if (!pnlInput && !rInput) {
      toast(t("needsResult"), "error");
      return;
    }
    const imagePromises = Array.from(form.imageFile.files).map(file => fileToDataUrl(file));
    const imagesData = (await Promise.all(imagePromises)).filter(Boolean);
    trade.status = "closed";
    trade.closedAt = todayISO();
    trade.pnl = pnlInput ? Number(pnlInput) : Number(rInput) * Number(trade.risk || 0);
    trade.rule = form.rule.value === "true";
    trade.emotion = form.emotion.value;
    trade.exitNote = form.exitNote.value.trim();
    if (imagesData.length) trade.images = imagesData;
    
    const isWin = trade.pnl > 0 || (trade.pnl === 0 && rValue(trade) > 0);
    const toastType = isWin ? "win" : "loss";
    
    saveState();
    closeModal();
    renderAll();
    const progress = sopProgress(trade.sopId);
    toast(`${sopName(trade.sopId)} now has ${progress.records} records.`, toastType);
  } catch (error) {
    toast(error.message, "error");
  }
}

function imagesFor(trade) {
  return trade.images?.length ? trade.images : [trade.imageData || trade.imageUrl].filter(Boolean);
}

function openDetail(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (!trade) return;
  const imgs = imagesFor(trade);
  let imageHtml = emptyState("No screenshot attached.");
  if (imgs.length > 1) {
    imageHtml = `
      <div class="carousel-container" style="display:flex; overflow-x:auto; gap:12px; padding-bottom:8px;">
        ${imgs.map((src, i) => `<button class="text-button" data-image="${trade.id}" data-index="${i}" style="flex-shrink:0; border:1px solid var(--hairline); border-radius:8px; overflow:hidden;"><img src="${src}" alt="Screenshot ${i+1}" style="max-height:160px; object-fit:cover;" /></button>`).join("")}
      </div>
    `;
  } else if (imgs.length === 1) {
    imageHtml = `<button class="text-button" data-image="${trade.id}" data-index="0"><img src="${imgs[0]}" alt="Chart screenshot" /></button>`;
  }
  openModal("Trade detail", "Journal", `
    <div class="day-detail">
      <div class="insight-grid">${[
        insightCard("Symbol", trade.symbol, trade.direction),
        insightCard("Status", trade.status === "open" ? "Open" : "Closed", trade.status === "open" ? "Not in statistics yet" : formatR(rValue(trade))),
        insightCard("SOP", sopName(trade.sopId), accountName(trade.accountId)),
        insightCard("Setup", trade.setup, `Grade ${trade.grade}`),
        insightCard("Process", trade.rule ? "Followed" : "Broken", trade.emotion)
      ].join("")}</div>
      ${imageHtml}
      <div class="rich-text-content" style="margin:20px 0;">${parseMarkdown(safe(trade.status === "open" ? trade.entryPlan || "No entry plan." : trade.exitNote || trade.note || "No note."))}</div>
      <div class="row-actions">
        ${trade.status === "open" ? `<button class="primary-button" data-close-trade="${trade.id}">Close Trade</button>` : ""}
        ${trade.tradingViewUrl ? `<a class="primary-button" href="${safe(trade.tradingViewUrl)}" target="_blank" rel="noreferrer">Open Chart</a><button class="ghost-button" data-tv="${trade.id}">Embed TradingView</button>` : ""}
      </div>
      <div id="tvEmbed"></div>
    </div>
  `);
}

function openImage(id, index = 0) {
  const trade = state.trades.find((item) => item.id === id);
  const imgs = imagesFor(trade);
  if (!imgs[index]) return;
  openModal(`Screenshot ${index + 1} of ${imgs.length}`, "Image", `<img src="${imgs[index]}" alt="Chart screenshot" style="max-width:100%;" />`);
}

function embedTradingView(id) {
  const trade = state.trades.find((item) => item.id === id);
  const target = document.getElementById("tvEmbed");
  if (!trade?.tradingViewUrl || !target) return;
  target.innerHTML = `<iframe class="tv-frame" title="TradingView chart" src="${safe(trade.tradingViewUrl)}"></iframe><p class="muted">If the embed is blocked, use Open Chart.</p>`;
}

function openModal(title, kicker, html) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalKicker").textContent = kicker;
  document.getElementById("modalBody").innerHTML = html;
  const backdrop = document.getElementById("modalBackdrop");
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const backdrop = document.getElementById("modalBackdrop");
  backdrop.classList.add("hidden");
  backdrop.setAttribute("aria-hidden", "true");
}

function toast(message, type = "info") {
  if (type === "win") playSound("win");
  else if (type === "loss") playSound("loss");
  else if (type === "delete") playSound("delete");
  else playSound(type === "error" ? "error" : "success");
  
  const el = document.createElement("div");
  el.className = `toast ${type === "win" ? "success" : type === "loss" ? "error" : type === "delete" ? "info" : type}`;
  el.textContent = message;
  document.getElementById("toastStack").appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 220);
  }, 3000);
}

function exportCsv() {
  const headers = ["status", "date", "closedAt", "symbol", "sopName", "sopId", "accountName", "accountId", "accountStartingBalance", "accountCurrentBalance", "setup", "direction", "grade", "risk", "pnl", "r", "rule", "emotion", "entryPlan", "stopPlan", "targetPlan", "exitNote", "tradingViewUrl", "imageUrl", "imageCount", "note"];
  const rows = state.trades.map((trade) => headers.map((key) => {
    const account = state.accounts.find((item) => item.id === trade.accountId);
    const value = key === "r"
      ? rValue(trade).toFixed(2)
      : key === "sopName"
        ? sopName(trade.sopId)
        : key === "accountName"
          ? accountName(trade.accountId)
          : key === "accountStartingBalance"
            ? account?.startingBalance ?? ""
            : key === "accountCurrentBalance"
              ? account?.currentBalance ?? ""
              : key === "imageCount"
                ? imagesFor(trade).length
                : trade[key];
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }).join(","));
  download("trd-journey.csv", [headers.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  download("trd-journey-backup.json", JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2), "application/json");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    const incoming = normalizeState(imported);
    if (!Array.isArray(incoming.trades)) throw new Error("Invalid backup file.");
    showImportPreview(incoming);
  } catch (error) {
    toast("Invalid JSON backup. Current data was not changed.", "error");
  }
}

function resetDemo() {
  if (!confirm("Reset to demo data? This replaces current local data.")) return;
  state = defaultState();
  saveState();
  resetTradeForm();
  renderAll();
  toast("Demo data restored.");
}

function openModule(id, source = null) {
  const view = document.getElementById(id);
  if (!view) return;
  
  playSound("switch");
  activeModule = id;
  
  // Toggle views
  document.querySelectorAll(".view").forEach((item) => {
    item.classList.toggle("active", item.id === id);
  });
  
  // Update Dock active states
  document.querySelectorAll(".dock-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.dockModule === id);
  });
  
  // Trigger shimmer skeleton loaders
  const mainEl = document.querySelector(".main");
  if (mainEl) {
    mainEl.classList.add("is-skeleton");
    setTimeout(() => mainEl.classList.remove("is-skeleton"), 240);
  }
  
  // Custom header Log Trade visibility
  const actionBtn = document.getElementById("headerLogTradeBtn");
  if (actionBtn) {
    actionBtn.classList.toggle("hidden", id === "journal");
  }
  
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeModule() {
  openModule("overview");
}

function switchLanguage() {
  playSound("switch");
  language = language === "en" ? "zh" : "en";
  localStorage.setItem(LANGUAGE_KEY, language);
  renderAll();
  toast(t("languageSaved"));
}

function switchTheme() {
  playSound("switch");
  theme = theme === "light" ? "dark" : "light";
  localStorage.setItem("trd-journey-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
  renderThemeButtons();
  toast(theme === "dark" ? "Dark mode enabled." : "Light mode enabled.");
}

function renderThemeButtons() {
  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.textContent = theme === "light" ? "☾" : "☀";
  });
}

document.querySelectorAll("[data-open-module]").forEach((button) => {
  button.addEventListener("click", () => openModule(button.dataset.openModule, button));
});

document.querySelectorAll(".language-toggle").forEach((button) => {
  button.addEventListener("click", switchLanguage);
});

document.querySelectorAll(".theme-toggle").forEach((button) => {
  button.addEventListener("click", switchTheme);
});

document.getElementById("backHomeBtn")?.addEventListener("click", closeModule);

document.getElementById("tradeForm").addEventListener("submit", saveTradeFromForm);
document.getElementById("cancelEditBtn").addEventListener("click", resetTradeForm);
document.getElementById("setupFilter").addEventListener("change", renderJournal);
document.getElementById("activeSopSelect").addEventListener("change", (event) => {
  state.activeSopId = event.target.value;
  state.activeAccountId = accountsForSop(state.activeSopId)[0]?.id || "";
  saveState();
  renderAll();
  resetTradeForm();
});
document.getElementById("accountFilterSelect").addEventListener("change", (event) => {
  state.activeAccountId = event.target.value;
  saveState();
  renderAll();
  resetTradeForm();
});
document.getElementById("tradeSopSelect").addEventListener("change", (event) => {
  state.activeSopId = event.target.value;
  state.activeAccountId = accountsForSop(state.activeSopId)[0]?.id || "";
  saveState();
  renderAll();
  resetTradeForm();
});
document.getElementById("tradeAccountSelect").addEventListener("change", (event) => {
  state.activeAccountId = event.target.value;
  saveState();
});
document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
document.getElementById("exportJsonBtn").addEventListener("click", exportJson);
document.getElementById("importJsonInput").addEventListener("change", (event) => importJson(event.target.files[0]));
document.getElementById("resetBtn").addEventListener("click", resetDemo);
document.getElementById("addSopBtn").addEventListener("click", () => openSopModal());
document.getElementById("addAccountBtn").addEventListener("click", () => openAccountModal());
document.getElementById("journalAddSopBtn").addEventListener("click", () => openSopModal());
document.getElementById("journalAddAccountBtn").addEventListener("click", () => openAccountModal());
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("modalBackdrop").addEventListener("click", (event) => {
  if (event.target.id === "modalBackdrop") closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!document.getElementById("modalBackdrop").classList.contains("hidden")) closeModal();
  else if (activeModule) closeModule();
});

document.body.addEventListener("click", (event) => {
  const shortcut = event.target.closest("[data-view-shortcut]")?.dataset.viewShortcut;
  const detail = event.target.closest("[data-detail]")?.dataset.detail;
  const edit = event.target.closest("[data-edit]")?.dataset.edit;
  const del = event.target.closest("[data-delete]")?.dataset.delete;
  const closeTrade = event.target.closest("[data-close-trade]")?.dataset.closeTrade;
  const sop = event.target.closest("[data-sop]")?.dataset.sop;
  const account = event.target.closest("[data-account]")?.dataset.account;
  const editSop = event.target.closest("[data-edit-sop]")?.dataset.editSop;
  const addAccount = event.target.closest("[data-add-account]")?.dataset.addAccount;
  const editAccount = event.target.closest("[data-edit-account]")?.dataset.editAccount;
  const editActiveAccount = event.target.closest("[data-edit-active-account]");
  const openCapture = event.target.closest("[data-open-capture]");
  const journalViewTarget = event.target.closest("[data-journal-view]")?.dataset.journalView;
  const day = event.target.closest("[data-day]")?.dataset.day;
  const imageEl = event.target.closest("[data-image]");
  const image = imageEl?.dataset.image;
  const imageIndex = imageEl?.dataset.index;
  const tv = event.target.closest("[data-tv]")?.dataset.tv;
  const deleteSopId = event.target.closest("[data-delete-sop]")?.dataset.deleteSop;
  const insightKey = event.target.closest("[data-insight]")?.dataset.insight;
  if (shortcut) openModule(shortcut);
  if (detail) openDetail(detail);
  if (edit) editTrade(edit);
  if (del) deleteTrade(del);
  if (closeTrade) openCloseTradeModal(closeTrade);
  if (sop) {
    state.activeSopId = sop;
    state.activeAccountId = accountsForSop(sop)[0]?.id || "";
    saveState();
    renderAll();
    resetTradeForm();
  }
  if (account) {
    state.activeAccountId = account;
    saveState();
    renderAll();
    resetTradeForm();
  }
  if (editSop) openSopModal(editSop);
  if (addAccount) openAccountModal(addAccount);
  if (editAccount) {
    const item = state.accounts.find((entry) => entry.id === editAccount);
    openAccountModal(item?.sopId || state.activeSopId, editAccount);
  }
  if (editActiveAccount) openAccountModal(state.activeSopId, state.activeAccountId);
  if (openCapture) {
    openModule("journal");
    const details = document.getElementById("captureTradeDetails");
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (journalViewTarget) {
    journalView = journalViewTarget;
    document.querySelectorAll("[data-journal-view]").forEach((button) => button.classList.toggle("active", button.dataset.journalView === journalView));
    document.getElementById("sopTimeline").classList.toggle("hidden", journalView !== "timeline");
    document.getElementById("journalTablePanel").classList.toggle("hidden", journalView !== "table");
  }
  if (day) {
    setWorkflowDate(day);
  }
  if (image) openImage(image, imageIndex ? parseInt(imageIndex, 10) : 0);
  if (tv) embedTradingView(tv);
  if (deleteSopId) deleteSop(deleteSopId);
  if (insightKey) openInsightDetail(insightKey);
});

document.body.addEventListener("submit", (event) => {
  if (event.target.id === "closeTradeForm") closeTradeFromModal(event);
  if (event.target.id === "sopEditorForm") saveSopFromModal(event);
  if (event.target.id === "accountEditorForm") saveAccountFromModal(event);
});

document.querySelectorAll("[data-review-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    playSound("click");
    document.querySelectorAll("[data-review-panel]").forEach((item) => item.classList.toggle("active", item === button));
    const targetPanelId = `review-${button.dataset.reviewPanel}`;
    const targetPanel = document.getElementById(targetPanelId);
    
    document.querySelectorAll(".review-panel").forEach((panel) => {
      panel.classList.remove("active");
    });
    
    if (targetPanel) {
      targetPanel.classList.add("active");
      targetPanel.classList.add("is-skeleton");
      setTimeout(() => targetPanel.classList.remove("is-skeleton"), 200);
    }
    
    if (button.dataset.reviewPanel === "backtester") {
      populateBacktestSops();
      renderSavedBacktests();
      updateBacktesterUI();
    }
  });
});

document.querySelectorAll("#planForm [name='workflowDate'], #reviewForm [name='workflowDate']").forEach((input) => {
  input.addEventListener("change", (event) => setWorkflowDate(event.target.value));
});

document.getElementById("planForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const day = form.workflowDate.value || selectedDay || todayISO();
  selectedDay = day;
  state.dailyPlans[day] = {
    bias: form.bias.value.trim(),
    levels: form.levels.value.trim(),
    allowedSetups: form.allowedSetups.value.trim(),
    maxLossR: Number(form.maxLossR.value),
    maxTrades: Number(form.maxTrades.value)
  };
  saveState();
  renderAll();
  toast(`Plan saved for ${day}.`);
});

document.getElementById("reviewForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const day = form.workflowDate.value || selectedDay || todayISO();
  selectedDay = day;
  state.dailyReviews[day] = {
    keep: form.keep.value.trim(),
    remove: form.remove.value.trim(),
    focus: form.focus.value.trim()
  };
  saveState();
  renderAll();
  toast(`Review saved for ${day}.`);
});

document.getElementById("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  state.preferences = {
    defaultSymbol: form.defaultSymbol.value.trim().toUpperCase() || "NQ",
    riskPerTrade: Number(form.riskPerTrade.value),
    dailyMaxLossR: Number(form.dailyMaxLossR.value),
    maxTradesPerDay: Number(form.maxTradesPerDay.value),
    setups: form.setups.value.split("\n").map((item) => item.trim()).filter(Boolean),
    dailyRules: form.dailyRules.value.split("\n").map((item) => item.trim()).filter(Boolean)
  };
  if (!state.preferences.setups.length) state.preferences.setups = [...defaultPreferences.setups];
  state = ensureSopState(state);
  saveState();
  resetTradeForm();
  renderAll();
  toast("Preferences saved.");
});

function openInsightDetail(key) {
  const panel = document.getElementById("insightDetailPanel");
  const chart = document.getElementById("insightDetailChart");
  const title = document.getElementById("insightDetailTitle");
  const kicker = document.getElementById("insightDetailKicker");
  const cards = document.getElementById("insightDetailCards");
  if (!panel) return;

  const closed = closedTrades();
  if (!closed.length) { toast("No closed trades yet.", "error"); return; }

  let seriesData = [];
  let detailCards = [];
  let chartOptions = {};

  if (key === "weekR" || key === "totalR") {
    kicker.textContent = key === "weekR" ? "Weekly Trend" : "Cumulative Equity";
    title.textContent = key === "weekR" ? "R-Value per trade (this week)" : "Equity curve (all trades)";
    let total = 0;
    seriesData = [{ value: 0, label: "Start" }, ...closed.map((t) => {
      total += rValue(t);
      return { value: total, label: t.date, detail: `${t.symbol} (${formatR(rValue(t))})` };
    })];
    const m = metrics();
    detailCards = [
      insightCard("Win Rate", `${Math.round(m.winRate * 100)}%`, `${m.wins}W / ${m.losses}L`),
      insightCard("Expectancy", formatR(m.expectancy), "Per trade average"),
      insightCard("Profit Factor", Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞", "Gross profit / Gross loss"),
      insightCard("Max DD", formatR(m.maxDrawdown), "Worst peak-to-trough"),
    ];
  } else if (key === "streak") {
    kicker.textContent = "Daily Performance";
    title.textContent = "Daily R over time";
    const dayMap = {};
    closed.forEach((t) => { dayMap[t.date] = (dayMap[t.date] || 0) + rValue(t); });
    const sortedDays = Object.keys(dayMap).sort();
    seriesData = sortedDays.map((d) => ({ value: dayMap[d], label: d, detail: `Day total: ${formatR(dayMap[d])}` }));
    const posDays = sortedDays.filter((d) => dayMap[d] > 0).length;
    const negDays = sortedDays.filter((d) => dayMap[d] < 0).length;
    detailCards = [
      insightCard("Green Days", String(posDays), `${Math.round(posDays / sortedDays.length * 100)}% of days`),
      insightCard("Red Days", String(negDays), `${Math.round(negDays / sortedDays.length * 100)}% of days`),
      insightCard("Best Day", formatR(Math.max(...Object.values(dayMap))), "Single day best"),
      insightCard("Worst Day", formatR(Math.min(...Object.values(dayMap))), "Single day worst"),
    ];
  } else if (key === "bestSetup" || key === "worstSetup") {
    kicker.textContent = "Setup Analysis";
    title.textContent = "Cumulative R by setup";
    const grouped = Object.entries(groupBy(closed, "setup"));
    const allSetupCards = grouped.map(([name, list]) => {
      const m = metrics(list);
      return insightCard(name, formatR(m.totalR), `${m.count} trades · WR ${Math.round(m.winRate * 100)}%`);
    });
    detailCards = allSetupCards;
    let total = 0;
    seriesData = [{ value: 0, label: "Start" }, ...closed.map((t) => {
      total += rValue(t);
      return { value: total, label: t.setup, detail: `${t.symbol} ${formatR(rValue(t))}` };
    })];
  } else if (key === "largestWin" || key === "largestLoss") {
    kicker.textContent = "Trade Distribution";
    title.textContent = "Individual trade R-values";
    seriesData = closed.map((t) => ({ value: rValue(t), label: t.date, detail: `${t.symbol} ${t.setup}` }));
    const sorted = [...closed].sort((a, b) => rValue(b) - rValue(a));
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3).reverse();
    detailCards = [
      ...top3.map((t, i) => insightCard(`#${i + 1} Best`, formatR(rValue(t)), `${t.symbol} · ${t.date}`)),
      ...bottom3.map((t, i) => insightCard(`#${i + 1} Worst`, formatR(rValue(t)), `${t.symbol} · ${t.date}`)),
    ];
  } else if (key === "processLeak") {
    kicker.textContent = "Process Quality";
    title.textContent = "Rule adherence over time";
    let followed = 0;
    seriesData = closed.map((t, i) => {
      if (t.rule) followed++;
      const rate = Math.round(followed / (i + 1) * 100);
      return { value: rate, label: t.date, detail: `${t.symbol} · ${t.rule ? "Followed" : "Broken"}` };
    });
    const ruleFollowed = closed.filter((t) => t.rule).length;
    const gradeA = closed.filter((t) => t.grade === "A").length;
    detailCards = [
      insightCard("Rules Followed", `${Math.round(ruleFollowed / closed.length * 100)}%`, `${ruleFollowed} of ${closed.length}`),
      insightCard("A-Grade Trades", `${Math.round(gradeA / closed.length * 100)}%`, `${gradeA} of ${closed.length}`),
      insightCard("Avg R (Rule ✓)", formatR(metrics(closed.filter((t) => t.rule)).expectancy), "When following rules"),
      insightCard("Avg R (Rule ✗)", formatR(metrics(closed.filter((t) => !t.rule)).expectancy), "When breaking rules"),
    ];
  } else {
    return;
  }

  panel.style.display = "block";
  renderLineChart("insightDetailChart", seriesData, chartOptions);
  cards.innerHTML = detailCards.join("");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("closeInsightDetail")?.addEventListener("click", () => {
  document.getElementById("insightDetailPanel").style.display = "none";
});

// --- Phase 5: Additional UI & Backtesting Sandbox Helper Functions ---

let sandboxTrades = [];

function initCardSpotlightHover() {
  document.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".home-card, .play-card, .sop-card-container");
    
    // Reset all other cards
    const activeCards = document.querySelectorAll(".home-card, .play-card, .sop-card-container");
    activeCards.forEach(c => {
      if (c !== card) {
        c.style.transform = "";
        c.style.transition = "transform var(--motion-base) var(--spring)";
        c.style.setProperty("--mouse-x", "-999px");
        c.style.setProperty("--mouse-y", "-999px");
      }
    });
    
    if (!card) return;
    
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    card.style.setProperty("--mouse-x", `${x}px`);
    card.style.setProperty("--mouse-y", `${y}px`);
    
    // Tilt calculations
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (centerY - y) / 12;
    const rotateY = (x - centerX) / 12;
    
    card.style.transition = "transform 0.08s ease-out";
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
  });
  
  document.addEventListener("mouseleave", (e) => {
    const card = e.target.closest(".home-card, .play-card, .sop-card-container");
    if (card) {
      card.style.transition = "transform var(--motion-base) var(--spring)";
      card.style.transform = "";
      card.style.setProperty("--mouse-x", "-999px");
      card.style.setProperty("--mouse-y", "-999px");
    }
  }, true);
}

function initCalendarHover() {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  
  grid.addEventListener("mouseover", (e) => {
    const dayBtn = e.target.closest(".calendar-day");
    if (!dayBtn || dayBtn.classList.contains("empty")) return;
    
    const day = dayBtn.dataset.day;
    if (!day) return;
    
    const dayTrades = byDate(day);
    const closed = closedTrades(dayTrades);
    const m = metrics(closed);
    const review = state.dailyReviews[day];
    const plan = state.dailyPlans[day];
    
    let html = `<div style="font-family:-apple-system, sans-serif; font-size:12px; line-height:1.45; text-align:left;">`;
    html += `<strong style="font-size:13px; color:var(--ink); display:block; margin-bottom:4px;">${day}</strong>`;
    
    if (dayTrades.length === 0) {
      html += `<span class="muted">No trades recorded.</span>`;
    } else {
      html += `<span style="font-weight:600; color:${m.totalR >= 0 ? 'var(--green)' : 'var(--red)'}">Profit: ${formatR(m.totalR)}</span> (${closed.length} closed, ${dayTrades.length - closed.length} open)<br>`;
      html += `<div style="margin-top:6px; border-top:1px solid var(--hairline); padding-top:4px; max-height:80px; overflow-y:auto; display:grid; gap:2px;">`;
      dayTrades.forEach(t => {
        const val = t.status === "open" ? "Open" : (t.pnl ? `$${t.pnl}` : formatR(rValue(t)));
        html += `<div style="font-size:11px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${t.pnl >= 0 || rValue(t) >= 0 ? 'var(--green)' : 'var(--red)'}; margin-right:4px;"></span>`;
        html += `<strong>${safe(t.symbol)}</strong> (${safe(t.setup)}) ${t.direction}: <strong>${val}</strong></div>`;
      });
      html += `</div>`;
    }
    
    if (plan) {
      html += `<div style="margin-top:6px; border-top:1px solid var(--hairline); padding-top:4px; opacity:0.85;">`;
      html += `<strong>Plan:</strong> ${safe(plan.bias)} (${plan.allowedSetups})<br>`;
      html += `</div>`;
    }
    if (review) {
      html += `<div style="margin-top:4px; opacity:0.85;">`;
      html += `<strong>Focus:</strong> ${safe(review.focus)}<br>`;
      html += `</div>`;
    }
    html += `</div>`;
    
    const tooltip = document.getElementById("chartTooltip");
    if (tooltip) {
      tooltip.innerHTML = html;
      const rect = dayBtn.getBoundingClientRect();
      const tooltipX = window.scrollX + rect.left + rect.width / 2;
      const tooltipY = window.scrollY + rect.top - 10;
      
      tooltip.style.left = tooltipX + "px";
      tooltip.style.top = tooltipY + "px";
      tooltip.style.transform = "translate(-50%, -100%)";
      tooltip.classList.remove("hidden");
    }
  });
  
  grid.addEventListener("mouseleave", () => {
    const tooltip = document.getElementById("chartTooltip");
    if (tooltip) tooltip.classList.add("hidden");
  }, true);
  
  grid.addEventListener("mouseout", (e) => {
    const dayBtn = e.target.closest(".calendar-day");
    if (!dayBtn) {
      const tooltip = document.getElementById("chartTooltip");
      if (tooltip) tooltip.classList.add("hidden");
    }
  });
}

function updateStorageEstimate() {
  const el = document.getElementById("storageEstimate");
  if (!el) return;
  
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then((estimate) => {
      const usedMb = (estimate.usage / (1024 * 1024)).toFixed(2);
      const totalMb = (estimate.quota / (1024 * 1024)).toFixed(0);
      el.textContent = `${usedMb} MB / ${totalMb} MB (${((estimate.usage / estimate.quota) * 100).toFixed(4)}%)`;
    }).catch(() => {
      el.textContent = "Offline storage quota available";
    });
  } else {
    el.textContent = "Supported";
  }
}

function updateSyncStatus() {
  const dot = document.getElementById("syncStatusDot");
  if (!dot) return;
  
  if (navigator.onLine) {
    dot.className = "status-dot online";
    dot.title = "Online (Local Storage Sync ready)";
  } else {
    dot.className = "status-dot offline";
    dot.title = "Offline (Local Database Sandbox mode active)";
  }
}

function showUpdateBanner(worker) {
  let banner = document.getElementById("pwaUpdateBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "pwaUpdateBanner";
    banner.className = "update-banner";
    const text = t("System update ready, click to reload.") || "System update ready, click to reload.";
    const btnText = t("Update") || "Update";
    banner.innerHTML = `
      <span>${text}</span>
      <button class="primary-button" style="padding:4px 10px; font-size:12px; margin-left:8px; border-radius:999px; background:white; color:var(--blue); font-weight:700; border:none;">${btnText}</button>
    `;
    document.body.appendChild(banner);
    
    banner.querySelector("button").addEventListener("click", () => {
      playSound("click");
      worker.postMessage({ action: "skipWaiting" });
    });
  }
  setTimeout(() => banner.classList.add("show"), 100);
}

function flipCard(id) {
  playSound("flip");
  const container = document.getElementById(`container-${id}`);
  if (container) {
    container.classList.toggle("flipped");
  }
}

function drawMiniSparklineMarkup(closed) {
  if (!closed || closed.length === 0) {
    return `<svg class="mini-sparkline" viewBox="0 0 100 24" aria-hidden="true"><line x1="0" y1="12" x2="100" y2="12" stroke="var(--hairline)" stroke-width="1.5" stroke-dasharray="2,2"></line></svg>`;
  }
  let total = 0;
  const values = [0];
  for (const t of closed) {
    total += rValue(t);
    values.push(total);
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 0.1);
  const points = values.map((val, idx) => {
    const x = (idx / Math.max(values.length - 1, 1)) * 100;
    const y = 22 - ((val - min) / spread) * 20;
    return `${x},${y}`;
  }).join(" ");
  
  const strokeColor = total >= 0 ? "var(--green)" : "var(--red)";
  return `<svg class="mini-sparkline" viewBox="0 0 100 24" style="overflow:visible;" aria-hidden="true">
    <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
  </svg>`;
}

function populateBacktestSops() {
  const select = document.getElementById("backtestSopSelect");
  if (!select) return;
  const activeSops = state.sops.filter(s => !s.archivedAt);
  select.innerHTML = activeSops.map(s => `<option value="${s.id}">${safe(s.name)}</option>`).join("");
}

function calculateBacktestStats() {
  const capitalInput = document.getElementById("backtestCapital");
  const riskModeInput = document.getElementById("backtestRiskMode");
  const riskValInput = document.getElementById("backtestRiskVal");
  
  const initialCapital = Number(capitalInput?.value || 10000);
  const riskMode = riskModeInput?.value || "fixed-usd";
  const riskVal = Number(riskValInput?.value || 100);
  
  let currentCapital = initialCapital;
  let grossWins = 0;
  let grossLosses = 0;
  let winCount = 0;
  
  const tradeRecords = sandboxTrades.map((r, idx) => {
    let riskAmount = 0;
    if (riskMode === "fixed-usd") {
      riskAmount = riskVal;
    } else {
      riskAmount = currentCapital * (riskVal / 100);
    }
    const pnl = riskAmount * r;
    currentCapital += pnl;
    
    if (r > 0) {
      winCount++;
      grossWins += pnl;
    } else if (r < 0) {
      grossLosses += Math.abs(pnl);
    }
    
    return {
      index: idx + 1,
      r,
      pnl: Math.round(pnl)
    };
  });
  
  const profitR = sandboxTrades.reduce((a, b) => a + b, 0);
  const profitUSD = currentCapital - initialCapital;
  const winRate = sandboxTrades.length ? winCount / sandboxTrades.length : 0;
  const expectancy = sandboxTrades.length ? profitR / sandboxTrades.length : 0;
  
  let peakR = 0;
  let currentR = 0;
  let maxDDR = 0;
  sandboxTrades.forEach(r => {
    currentR += r;
    peakR = Math.max(peakR, currentR);
    maxDDR = Math.max(maxDDR, peakR - currentR);
  });
  
  const pf = grossLosses > 0 ? grossWins / grossLosses : 0;
  
  return {
    tradeRecords,
    profitR,
    profitUSD: Math.round(profitUSD),
    winRate,
    expectancy,
    maxDDR,
    pf,
    finalCapital: Math.round(currentCapital)
  };
}

function renderBacktestTradesList(tradeRecords) {
  const tbody = document.getElementById("backtestRows");
  if (!tbody) return;
  
  if (tradeRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;">No mock trades in sandbox.</td></tr>`;
    document.getElementById("backtestCount").textContent = "0";
    return;
  }
  
  document.getElementById("backtestCount").textContent = String(tradeRecords.length);
  
  tbody.innerHTML = tradeRecords.map(t => {
    const pnlStyle = t.pnl >= 0 ? "color:var(--green); font-weight:600;" : "color:var(--red); font-weight:600;";
    return `
      <tr>
        <td>#${t.index}</td>
        <td><strong>${t.r >= 0 ? '+' : ''}${t.r}R</strong></td>
        <td style="${pnlStyle}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toLocaleString()}</td>
        <td style="text-align:right;">
          <button class="text-button danger" onclick="removeMockTrade(${t.index - 1})" style="padding:2px 6px; font-size:11px;">Remove</button>
        </td>
      </tr>
    `;
  }).join("");
}

function removeMockTrade(idx) {
  playSound("delete");
  sandboxTrades.splice(idx, 1);
  updateBacktesterUI();
}

function saveBacktestRun() {
  const sopSelect = document.getElementById("backtestSopSelect");
  const sopId = sopSelect?.value;
  if (!sopId) {
    toast("Please select a valid SOP first.", "error");
    return;
  }
  
  if (sandboxTrades.length === 0) {
    toast("Add some mock trades to the sandbox first.", "error");
    return;
  }
  
  const sop = state.sops.find(s => s.id === sopId);
  const capital = Number(document.getElementById("backtestCapital").value);
  const riskMode = document.getElementById("backtestRiskMode").value;
  const riskVal = Number(document.getElementById("backtestRiskVal").value);
  
  const newRun = {
    id: uid(),
    sopId,
    sopName: sop ? sop.name : "Untitled SOP",
    capital,
    riskMode,
    riskVal,
    trades: [...sandboxTrades],
    date: todayISO()
  };
  
  if (!state.backtests) state.backtests = [];
  state.backtests.push(newRun);
  saveState();
  playSound("success");
  toast("Backtest run saved.");
  renderSavedBacktests();
}

function renderSavedBacktests() {
  const listDiv = document.getElementById("savedBacktestList");
  if (!listDiv) return;
  
  const sopId = document.getElementById("backtestSopSelect")?.value;
  if (!sopId) {
    listDiv.innerHTML = `<p class="muted">Select an SOP to view saved runs.</p>`;
    return;
  }
  
  const runs = (state.backtests || []).filter(r => r.sopId === sopId);
  if (runs.length === 0) {
    listDiv.innerHTML = `<p class="muted">No saved backtests for this SOP.</p>`;
    return;
  }
  
  listDiv.innerHTML = runs.map(run => {
    const profitR = run.trades.reduce((a, b) => a + b, 0);
    const winRate = Math.round((run.trades.filter(r => r > 0).length / run.trades.length) * 100);
    return `
      <div class="status-card" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid var(--hairline); border-radius:12px; background:var(--paper-strong);">
        <div style="cursor:pointer; flex-grow:1;" onclick="loadBacktestRun('${run.id}')">
          <strong style="font-size:13px; display:block;">Run: ${run.date}</strong>
          <span style="font-size:11px; color:var(--muted);">${run.trades.length} trades · WR: ${winRate}% · Profit: <strong>${profitR >= 0 ? '+' : ''}${profitR.toFixed(1)}R</strong></span>
        </div>
        <button class="text-button danger" onclick="deleteBacktestRun('${run.id}')" style="padding:4px 8px; font-size:11px; margin-left:10px;">Delete</button>
      </div>
    `;
  }).join("");
}

function loadBacktestRun(id) {
  const run = (state.backtests || []).find(r => r.id === id);
  if (!run) return;
  
  playSound("switch");
  document.getElementById("backtestCapital").value = run.capital;
  document.getElementById("backtestRiskMode").value = run.riskMode;
  document.getElementById("backtestRiskVal").value = run.riskVal;
  
  sandboxTrades = [...run.trades];
  updateBacktesterUI();
  toast("Saved backtest loaded into Sandbox.");
}

function deleteBacktestRun(id) {
  if (!confirm("Delete this saved backtest run?")) return;
  playSound("delete");
  state.backtests = (state.backtests || []).filter(r => r.id !== id);
  saveState();
  toast("Backtest run deleted.");
  renderSavedBacktests();
}

function updateBacktesterUI() {
  const stats = calculateBacktestStats();
  
  // Render metrics
  setText("btMetricProfitR", `${stats.profitR >= 0 ? '+' : ''}${stats.profitR.toFixed(2)}R`);
  setText("btMetricProfitUSD", `${stats.profitUSD >= 0 ? '+' : ''}$${stats.profitUSD.toLocaleString()}`);
  setText("btMetricWinRate", `${Math.round(stats.winRate * 100)}%`);
  setText("btMetricExpectancy", `${stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(2)}R`);
  setText("btMetricMaxDD", `${stats.maxDDR.toFixed(2)}R`);
  setText("btMetricPF", stats.pf.toFixed(2));
  
  // Render trades table
  renderBacktestTradesList(stats.tradeRecords);
  
  // Render Chart
  let cumulativeR = 0;
  const series = [{ value: 0, label: "Start" }];
  sandboxTrades.forEach((r, idx) => {
    cumulativeR += r;
    series.push({ value: cumulativeR, label: `Mock #${idx + 1}`, detail: `R: ${r >= 0 ? '+' : ''}${r}R` });
  });
  renderLineChart("backtestChart", series, { negative: false });
  
  // Execution Gap Comparison
  const sopId = document.getElementById("backtestSopSelect")?.value;
  const comparePanel = document.getElementById("btComparePanel");
  
  if (sopId && comparePanel) {
    const liveTrades = state.trades.filter(t => t.sopId === sopId && t.status === "closed");
    if (liveTrades.length > 0) {
      const liveM = metrics(liveTrades);
      const wrGap = Math.round((liveM.winRate - stats.winRate) * 100);
      const expGap = liveM.expectancy - stats.expectancy;
      
      document.getElementById("compWinRate").innerHTML = `Live: <strong>${Math.round(liveM.winRate * 100)}%</strong> / BT: <strong>${Math.round(stats.winRate * 100)}%</strong> (Gap: <strong style="color:${wrGap >= 0 ? 'var(--green)' : 'var(--red)'}">${wrGap >= 0 ? '+' : ''}${wrGap}%</strong>)`;
      document.getElementById("compExpectancy").innerHTML = `Live: <strong>${formatR(liveM.expectancy)}</strong> / BT: <strong>${formatR(stats.expectancy)}</strong> (Gap: <strong style="color:${expGap >= 0 ? 'var(--green)' : 'var(--red)'}">${formatR(expGap)}</strong>)`;
      document.getElementById("compPF").innerHTML = `Live: <strong>${liveM.profitFactor.toFixed(2)}</strong> / BT: <strong>${stats.pf.toFixed(2)}</strong>`;
      
      comparePanel.style.display = "block";
    } else {
      comparePanel.style.display = "none";
    }
  }
}

function runBatchBacktest() {
  const textarea = document.getElementById("backtestBatchR");
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) {
    toast("Enter some numbers first.", "error");
    return;
  }
  
  const parsed = text.split(/[\s,;\n\r]+/).map(item => Number(item)).filter(item => !isNaN(item));
  if (parsed.length === 0) {
    toast("No valid numbers found.", "error");
    return;
  }
  
  playSound("success");
  sandboxTrades = parsed;
  updateBacktesterUI();
  toast(`Loaded ${parsed.length} mock trades.`);
}

function addManualMockTrade() {
  const rInput = document.getElementById("backtestManualR");
  const r = Number(rInput?.value || 0);
  if (isNaN(r) || rInput?.value.trim() === "") {
    toast("Enter a valid R-multiple.", "error");
    return;
  }
  
  playSound("switch");
  sandboxTrades.push(r);
  rInput.value = "";
  updateBacktesterUI();
  toast(`Added trade: ${r}R`);
}

function clearSandbox() {
  if (sandboxTrades.length === 0) return;
  if (!confirm("Clear sandbox trades?")) return;
  playSound("delete");
  sandboxTrades = [];
  document.getElementById("backtestBatchR").value = "";
  updateBacktesterUI();
  toast("Sandbox cleared.");
}

function initBacktesterListeners() {
  document.getElementById("btnBacktestModeBatch")?.addEventListener("click", (e) => {
    playSound("click");
    document.getElementById("btnBacktestModeBatch").classList.add("active");
    document.getElementById("btnBacktestModeManual").classList.remove("active");
    document.getElementById("backtestBatchArea").classList.remove("hidden");
    document.getElementById("backtestManualArea").classList.add("hidden");
  });
  
  document.getElementById("btnBacktestModeManual")?.addEventListener("click", (e) => {
    playSound("click");
    document.getElementById("btnBacktestModeManual").classList.add("active");
    document.getElementById("btnBacktestModeBatch").classList.remove("active");
    document.getElementById("backtestManualArea").classList.remove("hidden");
    document.getElementById("backtestBatchArea").classList.add("hidden");
  });
  
  document.getElementById("btnRunBatchBacktest")?.addEventListener("click", runBatchBacktest);
  document.getElementById("btnAddManualMock")?.addEventListener("click", addManualMockTrade);
  document.getElementById("btnSaveBacktest")?.addEventListener("click", saveBacktestRun);
  document.getElementById("btnClearBacktest")?.addEventListener("click", clearSandbox);
  
  document.getElementById("backtestSopSelect")?.addEventListener("change", () => {
    renderSavedBacktests();
    updateBacktesterUI();
  });
}

function showImportPreview(incoming) {
  const currentClosed = closedTrades();
  let currentTotal = 0;
  const currentSeries = [{ value: 0 }];
  currentClosed.forEach(t => {
    currentTotal += rValue(t);
    currentSeries.push({ value: currentTotal });
  });
  
  const mergedTrades = [...state.trades];
  incoming.trades.forEach(inTrade => {
    const idx = mergedTrades.findIndex(t => t.id === inTrade.id);
    if (idx >= 0) {
      mergedTrades[idx] = inTrade;
    } else {
      mergedTrades.push(inTrade);
    }
  });
  
  const mergedClosed = mergedTrades.filter(t => t.status === "closed").sort((a, b) => a.date.localeCompare(b.date));
  let mergedTotal = 0;
  const mergedSeries = [{ value: 0 }];
  mergedClosed.forEach(t => {
    mergedTotal += rValue(t);
    mergedSeries.push({ value: mergedTotal });
  });
  
  let newCount = 0;
  let duplicateCount = 0;
  incoming.trades.forEach(inTrade => {
    const exists = state.trades.some(t => t.id === inTrade.id);
    if (exists) duplicateCount++;
    else newCount++;
  });
  
  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <p style="font-size:13px; line-height:1.45;">We compared your backup file with current local data. Select how you want to import your data.</p>
      
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
        <div class="status-card" style="padding:10px; text-align:center; background:var(--paper-strong); border:1px solid var(--hairline); border-radius:10px;">
          <span style="font-size:11px; color:var(--muted); display:block;">Incoming Trades</span>
          <strong style="font-size:18px;">${incoming.trades.length}</strong>
          <small class="muted" style="font-size:10px; display:block; opacity:0.8;">(${newCount} new, ${duplicateCount} duplicate)</small>
        </div>
        <div class="status-card" style="padding:10px; text-align:center; background:var(--paper-strong); border:1px solid var(--hairline); border-radius:10px;">
          <span style="font-size:11px; color:var(--muted); display:block;">SOPs</span>
          <strong style="font-size:18px;">${incoming.sops.length}</strong>
        </div>
        <div class="status-card" style="padding:10px; text-align:center; background:var(--paper-strong); border:1px solid var(--hairline); border-radius:10px;">
          <span style="font-size:11px; color:var(--muted); display:block;">Accounts</span>
          <strong style="font-size:18px;">${incoming.accounts.length}</strong>
        </div>
      </div>
      
      <div>
        <strong style="font-size:12px; display:block; margin-bottom:6px;">Projected R-Curve Projection (Dashed: Current / Solid: Merged)</strong>
        <div style="border:1px solid var(--hairline); border-radius:14px; padding:10px; background:var(--canvas);">
          <svg id="importCompareChart" viewBox="0 0 760 240" style="width:100%; height:180px;"></svg>
        </div>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
        <button class="primary-button" id="btnConfirmMerge" style="background:var(--green); border-color:var(--green); color:white;">Smart Merge (Recommended)</button>
        <span style="font-size:11px; color:var(--muted); margin-top:-6px;">Combines backup with local data. Duplicate IDs will be updated.</span>
        
        <button class="primary-button danger" id="btnConfirmOverwrite" style="background:var(--red); border-color:var(--red); color:white;">Full Overwrite Restore</button>
        <span style="font-size:11px; color:var(--muted); margin-top:-6px;">Erase current local database and replace it completely with backup.</span>
      </div>
    </div>
  `;
  
  openModal("Import Backup", "Data Manager", content);
  
  setTimeout(() => {
    renderDualLineChart("importCompareChart", currentSeries, mergedSeries);
  }, 100);
  
  document.getElementById("btnConfirmMerge")?.addEventListener("click", () => {
    state.trades = mergedTrades;
    incoming.sops.forEach(inSop => {
      const idx = state.sops.findIndex(s => s.id === inSop.id);
      if (idx >= 0) state.sops[idx] = { ...state.sops[idx], ...inSop };
      else state.sops.push(inSop);
    });
    incoming.accounts.forEach(inAcct => {
      const idx = state.accounts.findIndex(a => a.id === inAcct.id);
      if (idx >= 0) state.accounts[idx] = inAcct;
      else state.accounts.push(inAcct);
    });
    if (incoming.backtests) {
      if (!state.backtests) state.backtests = [];
      incoming.backtests.forEach(inBt => {
        if (!state.backtests.some(b => b.id === inBt.id)) {
          state.backtests.push(inBt);
        }
      });
    }
    
    saveState();
    closeModal();
    playSound("success");
    renderAll();
    toast("Data merged successfully.");
  });
  
  document.getElementById("btnConfirmOverwrite")?.addEventListener("click", () => {
    if (!confirm("Are you absolutely sure you want to delete all current data and restore this backup? This cannot be undone.")) return;
    state = incoming;
    saveState();
    closeModal();
    playSound("success");
    renderAll();
    toast("Database fully restored.");
  });
}

function renderDualLineChart(id, currentSeries, projectedSeries) {
  const svg = document.getElementById(id);
  if (!svg) return;
  
  const width = 760;
  const height = 240;
  const pad = 32;
  
  const currentValues = currentSeries.map(p => p.value);
  const projectedValues = projectedSeries.map(p => p.value);
  const allValues = [...currentValues, ...projectedValues, 0];
  
  const min = Math.min(...allValues);
  const max = Math.max(...allValues, 1);
  const spread = Math.max(max - min, 1);
  
  const mapPoints = (series) => series.map((item, index) => {
    const x = pad + (index / Math.max(series.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((item.value - min) / spread) * (height - pad * 2);
    return { x, y };
  });
  
  const currentPoints = mapPoints(currentSeries);
  const projectedPoints = mapPoints(projectedSeries);
  
  const currentPath = currentPoints.map(p => `${p.x},${p.y}`).join(" ");
  const projectedPath = projectedPoints.map(p => `${p.x},${p.y}`).join(" ");
  const zeroY = height - pad - ((0 - min) / spread) * (height - pad * 2);
  
  svg.innerHTML = `
    <line class="grid-line" x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}" stroke="var(--hairline)"></line>
    <text class="axis-label" x="${pad}" y="${pad - 10}" fill="var(--muted)" font-size="10px">${formatR(max)}</text>
    <line class="zero-line" x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="var(--hairline-strong)"></line>
    <text class="axis-label" x="${pad}" y="${zeroY - 8}" fill="var(--muted)" font-size="10px">0R</text>
    <text class="axis-label" x="${pad}" y="${height - 8}" fill="var(--muted)" font-size="10px">${formatR(min)}</text>
    
    <!-- Current Curve (Dashed Blue) -->
    ${currentPoints.length ? `<polyline fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="5,5" points="${currentPath}"></polyline>` : ''}
    
    <!-- Projected Curve (Solid Green) -->
    ${projectedPoints.length ? `<polyline fill="none" stroke="var(--green)" stroke-width="3" points="${projectedPath}"></polyline>` : ''}
  `;
}

function initCollapsiblePanels() {
  const panels = document.querySelectorAll(".panel");
  panels.forEach((panel, idx) => {
    const head = panel.querySelector(".panel-head");
    if (!head) return;
    if (head.querySelector(".panel-collapse-btn")) return;
    
    const titleText = head.querySelector("h2")?.textContent || head.querySelector("h3")?.textContent || "";
    const key = "trd-panel-collapsed-" + (panel.id || titleText.replace(/[^a-zA-Z0-9]/g, "") || idx);
    
    const isCollapsed = localStorage.getItem(key) === "true";
    if (isCollapsed) {
      panel.classList.add("is-collapsed");
    }
    
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-collapse-btn";
    btn.innerHTML = isCollapsed ? "▲" : "▼";
    btn.title = "Toggle collapse";
    
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      playSound("click");
      const currentlyCollapsed = panel.classList.toggle("is-collapsed");
      btn.innerHTML = currentlyCollapsed ? "▲" : "▼";
      localStorage.setItem(key, String(currentlyCollapsed));
    });
    
    head.appendChild(btn);
  });
}

function initLayoutListeners() {
  // Bottom Dock navigation
  document.querySelectorAll(".dock-item").forEach((button) => {
    button.addEventListener("click", () => {
      openModule(button.dataset.dockModule, button);
    });
  });
  
  // Top header "Log Trade" button
  document.getElementById("headerLogTradeBtn")?.addEventListener("click", () => {
    openModule("journal");
    setTimeout(() => {
      const details = document.getElementById("captureTradeDetails");
      if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 240);
  });
}

async function initApp() {
  state = await loadState();
  await saveState(); // Ensure initialized defaults or migrated data are saved
  renderAll();
  resetTradeForm();
  
  // Initial view defaults to Today tab
  openModule("overview");
  
  // Phase 5 & 6 Initializations
  initCardSpotlightHover();
  initCalendarHover();
  initBacktesterListeners();
  initLayoutListeners();
  updateStorageEstimate();
  updateSyncStatus();
  
  window.addEventListener("online", updateSyncStatus);
  window.addEventListener("offline", updateSyncStatus);
  
  // Register service worker with version update banner
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      if (reg.waiting) {
        showUpdateBanner(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch((err) => console.log("SW failed", err));
    
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }
}

initApp();
