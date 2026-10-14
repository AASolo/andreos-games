"use strict";

/* ================= Данные ================= */

const REPO = "AASolo/andreos-games";
const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`;
const APK_URL = `https://github.com/${REPO}/releases/latest/download/AndreosPlay.apk`;

const games = [
  { id: "doroga-v-okean", title: "Дорога в океан", cover: "og.jpg", accent: "#35d0ba",
    text: "Вырасти малька за 30 дней заботы и открой ему дорогу в океан.", tag: "Уютные" },
  { id: "ButerBashnya-1.0", title: "Бутербашня", cover: "og-image.png", accent: "#ffc42e",
    text: "Построй башню из бургеров до самого космоса.", tag: "Аркады" },
  { id: "kimchi-gleba", title: "Кимчи-кафе Глеба Ли", cover: "og.jpg", accent: "#ff7a2f",
    text: "Собери кимчи по рецепту и накорми гостей.", tag: "Кулинария" },
  { id: "HackQuest-3.0", title: "HackQuest", cover: "og-image.png", accent: "#2bff7a",
    text: "Хакерская игра: 30 миссий на Python и секретный проект OBELISK.", tag: "Обучение" },
  { id: "BlockFlip", title: "Блок Флип", cover: "cover.png", accent: "#ffc24a",
    text: "Деревянные блоки на поле 8×8: верти фигуры, собирай кристаллы и взрывай бомбы.", tag: "Головоломки" },
];
const byId = Object.fromEntries(games.map(g => [g.id, g]));
const url = g => `games/${g.id}/index.html`;
const img = g => `games/${g.id}/${g.cover}`;

const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>';
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';

/* ================= Хранилище ================= */

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const settings = Object.assign({ haptics: true, sounds: true, music: true, motion: true, reminders: true }, store.get("ap:settings", {}));

// Статистика: { time: {id: мс}, plays: {id: n}, days: ["2026-10-13", ...], night, early }
function loadStats() {
  return Object.assign({
    time: {}, plays: {}, days: [], night: false, early: false,
    dayPlays: {}, dayGames: {}, longest: 0, tabs: [], musicMs: 0,
    lunch: false, weekend: false, newyear: false, comeback: false,
    magic: false, shared: false, shortcut: false,
  }, store.get("ap:stats", {}));
}
let stats = loadStats();
let recent = store.get("ap:recent", []);
let favs = new Set(store.get("ap:favs", []));

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function streak() {
  const days = new Set(stats.days);
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // серия не сгорает, пока не кончился сегодняшний день
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function bestStreak() {
  const sorted = [...new Set(stats.days)].sort();
  let best = 0, cur = 0, prev = null;
  for (const k of sorted) {
    const t = new Date(k + "T12:00:00");
    cur = prev && (t - prev) / 864e5 === 1 ? cur + 1 : 1;
    best = Math.max(best, cur); prev = t;
  }
  return best;
}
const totalTime = () => Object.values(stats.time).reduce((a, b) => a + b, 0);
const totalPlays = () => Object.values(stats.plays).reduce((a, b) => a + b, 0);

function fmtTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return ms > 0 ? "< 1 мин" : "0 мин";
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

/* ================= Достижения ================= */

const MIN = 60000, HOUR = 3600e3;
const gp = () => store.get("ap:gp", {}); // рекорды внутри игр, их пишет andreos-bridge.js
const playsOf = id => stats.plays[id] || 0;
const minsOf = id => Math.floor((stats.time[id] || 0) / MIN);
const maxDayPlays = () => Math.max(0, ...Object.values(stats.dayPlays));
const maxDayGames = () => Math.max(0, ...Object.values(stats.dayGames).map(l => l.length));

// tier: 1 бронза, 2 серебро, 3 золото. secret: название скрыто, пока не получено.
const awardGroups = [
  ["start", "Первые шаги"], ["ingame", "Успехи в играх"], ["games", "По играм"], ["plays", "Запуски"], ["time", "Время в играх"],
  ["streak", "Серии дней"], ["moments", "Особые моменты"], ["secret", "Секретные"],
];
const awards = [
  { g: "start", id: "first", icon: "🎮", title: "Первый шаг", text: "Запусти любую игру", goal: 1, tier: 1, val: () => totalPlays() },
  { g: "start", id: "all", icon: "🗺️", title: "Исследователь", text: "Попробуй все игры", goal: games.length, tier: 2, val: () => games.filter(g => playsOf(g.id)).length },
  { g: "start", id: "love", icon: "❤️", title: "Любимчик", text: "Добавь игру в избранное", goal: 1, tier: 1, val: () => favs.size },
  { g: "start", id: "loveall", icon: "💞", title: "Люблю их все", text: "Добавь в избранное все игры", goal: games.length, tier: 2, val: () => favs.size },
  { g: "start", id: "tabs", icon: "🧭", title: "Любопытный", text: "Загляни во все вкладки приложения", goal: 3, tier: 1, val: () => stats.tabs.length },

  { g: "ingame", id: "release1", icon: "🐟", title: "Первый выпуск", text: "Выпусти рыбку в океан в «Дороге в океан»", goal: 1, tier: 2, val: () => gp().fishReleased || 0 },
  { g: "ingame", id: "release3", icon: "🐋", title: "Хранитель океана", text: "Выпусти в океан 3 рыбки", goal: 3, tier: 3, val: () => gp().fishReleased || 0 },
  { g: "ingame", id: "tower30", icon: "🏙️", title: "Выше облаков", text: "Построй в «Бутербашне» башню из 30 этажей", goal: 30, tier: 2, val: () => gp().buterBest || 0 },
  { g: "ingame", id: "coins500", icon: "🪙", title: "Копилка", text: "Накопи 500 монет в «Бутербашне»", goal: 500, tier: 2, val: () => gp().buterCoins || 0 },
  { g: "ingame", id: "chef5", icon: "🍲", title: "Шеф-повар", text: "Дойди до 5 уровня в «Кимчи-кафе»", goal: 5, tier: 2, val: () => gp().kimchiLevel || 0 },
  { g: "ingame", id: "cafe300", icon: "💰", title: "Касса полна", text: "Заработай 300 монет в «Кимчи-кафе»", goal: 300, tier: 1, val: () => gp().kimchiCoins || 0 },
  { g: "ingame", id: "hack10", icon: "🔓", title: "Взломщик", text: "Пройди 10 миссий в HackQuest", goal: 10, tier: 2, val: () => gp().hackDone || 0 },
  { g: "ingame", id: "obelisk", icon: "🗿", title: "OBELISK", text: "Пройди все 30 миссий в HackQuest", goal: 30, tier: 3, val: () => gp().hackDone || 0 },
  { g: "ingame", id: "block5k", icon: "🧱", title: "Мастер блоков", text: "Набери 5000 очков в классике «Блок Флипа»", goal: 5000, tier: 2, val: () => gp().blockBest || 0 },
  { g: "ingame", id: "gems10", icon: "💎", title: "Охотник за кристаллами", text: "Пройди 10 уровней приключения в «Блок Флипе»", goal: 10, tier: 3, val: () => gp().blockLevel || 0 },

  { g: "games", id: "fish5", icon: "🐠", title: "Друг рыбки", text: "Запусти «Дорогу в океан» 5 раз", goal: 5, tier: 1, val: () => playsOf("doroga-v-okean") },
  { g: "games", id: "fish30", icon: "🌊", title: "Океанолог", text: "Проведи в «Дороге в океан» 30 минут", goal: 30, tier: 2, val: () => minsOf("doroga-v-okean") },
  { g: "games", id: "burger5", icon: "🍔", title: "Повар-строитель", text: "Запусти «Бутербашню» 5 раз", goal: 5, tier: 1, val: () => playsOf("ButerBashnya-1.0") },
  { g: "games", id: "burger30", icon: "🏗️", title: "Небоскрёб", text: "Проведи в «Бутербашне» 30 минут", goal: 30, tier: 2, val: () => minsOf("ButerBashnya-1.0") },
  { g: "games", id: "kimchi5", icon: "🥬", title: "Помощник Глеба", text: "Запусти «Кимчи-кафе» 5 раз", goal: 5, tier: 1, val: () => playsOf("kimchi-gleba") },
  { g: "games", id: "kimchi30", icon: "🌶️", title: "Шеф кимчи", text: "Проведи в «Кимчи-кафе» 30 минут", goal: 30, tier: 2, val: () => minsOf("kimchi-gleba") },
  { g: "games", id: "hack5", icon: "💻", title: "Скрипт-кидди", text: "Запусти HackQuest 5 раз", goal: 5, tier: 1, val: () => playsOf("HackQuest-3.0") },
  { g: "games", id: "hack30", icon: "🕶️", title: "Настоящий хакер", text: "Проведи в HackQuest 30 минут", goal: 30, tier: 2, val: () => minsOf("HackQuest-3.0") },
  { g: "games", id: "block5", icon: "🟫", title: "Плотник", text: "Запусти «Блок Флип» 5 раз", goal: 5, tier: 1, val: () => playsOf("BlockFlip") },
  { g: "games", id: "block30", icon: "🪵", title: "Столяр", text: "Проведи в «Блок Флипе» 30 минут", goal: 30, tier: 2, val: () => minsOf("BlockFlip") },
  { g: "games", id: "fan", icon: "💜", title: "Фанат", text: "Запусти одну игру 10 раз", goal: 10, tier: 2, val: () => Math.max(0, ...Object.values(stats.plays)) },
  { g: "games", id: "allround", icon: "🎲", title: "Универсал", text: "Проведи по 10 минут в каждой игре", goal: games.length, tier: 3, val: () => games.filter(g => minsOf(g.id) >= 10).length },

  { g: "plays", id: "p10", icon: "▶️", title: "Разогрев", text: "Сделай 10 запусков", goal: 10, tier: 1, val: () => totalPlays() },
  { g: "plays", id: "p50", icon: "🚀", title: "Завсегдатай", text: "Сделай 50 запусков", goal: 50, tier: 2, val: () => totalPlays() },
  { g: "plays", id: "p100", icon: "💯", title: "Сотня", text: "Сделай 100 запусков", goal: 100, tier: 3, val: () => totalPlays() },
  { g: "plays", id: "day3", icon: "🎯", title: "Три в одном", text: "Сыграй в 3 разные игры за один день", goal: 3, tier: 1, val: () => maxDayGames() },
  { g: "plays", id: "day10", icon: "🔁", title: "Не оторваться", text: "Сделай 10 запусков за один день", goal: 10, tier: 2, val: () => maxDayPlays() },

  { g: "time", id: "t15", icon: "⏱️", title: "Первые минуты", text: "Проведи в играх 15 минут", goal: 15, tier: 1, val: () => Math.floor(totalTime() / MIN) },
  { g: "time", id: "hour", icon: "🕐", title: "Марафон", text: "Проведи в играх 1 час", goal: 60, tier: 1, val: () => Math.floor(totalTime() / MIN) },
  { g: "time", id: "t5h", icon: "⌛", title: "Увлечённый", text: "Проведи в играх 5 часов", goal: 5, tier: 2, val: () => Math.floor(totalTime() / HOUR) },
  { g: "time", id: "t24h", icon: "🏆", title: "Легенда", text: "Проведи в играх 24 часа", goal: 24, tier: 3, val: () => Math.floor(totalTime() / HOUR) },
  { g: "time", id: "deep", icon: "🧘", title: "Погружение", text: "Играй 30 минут без перерыва", goal: 30, tier: 2, val: () => Math.floor(stats.longest / MIN) },
  { g: "time", id: "deep2", icon: "🛸", title: "Потерял счёт времени", text: "Играй 2 часа без перерыва", goal: 120, tier: 3, val: () => Math.floor(stats.longest / MIN) },

  { g: "streak", id: "s3", icon: "🔥", title: "В ритме", text: "Играй 3 дня подряд", goal: 3, tier: 1, val: () => bestStreak() },
  { g: "streak", id: "s7", icon: "⚡", title: "Неделя силы", text: "Играй 7 дней подряд", goal: 7, tier: 2, val: () => bestStreak() },
  { g: "streak", id: "s14", icon: "💎", title: "Две недели огня", text: "Играй 14 дней подряд", goal: 14, tier: 2, val: () => bestStreak() },
  { g: "streak", id: "s30", icon: "👑", title: "Король серий", text: "Играй 30 дней подряд", goal: 30, tier: 3, val: () => bestStreak() },
  { g: "streak", id: "d10", icon: "📅", title: "Постоянный гость", text: "Заходи поиграть в 10 разных дней", goal: 10, tier: 1, val: () => new Set(stats.days).size },
  { g: "streak", id: "d50", icon: "🗓️", title: "Старожил", text: "Заходи поиграть в 50 разных дней", goal: 50, tier: 3, val: () => new Set(stats.days).size },

  { g: "moments", id: "owl", icon: "🦉", title: "Ночная сова", text: "Сыграй после полуночи", goal: 1, tier: 1, val: () => +stats.night },
  { g: "moments", id: "bird", icon: "🐦", title: "Ранняя пташка", text: "Сыграй до 7 утра", goal: 1, tier: 1, val: () => +stats.early },
  { g: "moments", id: "lunch", icon: "🍜", title: "Обеденный перерыв", text: "Сыграй с 12 до 14 часов", goal: 1, tier: 1, val: () => +stats.lunch },
  { g: "moments", id: "weekend", icon: "🛋️", title: "Выходной", text: "Сыграй в субботу или воскресенье", goal: 1, tier: 1, val: () => +stats.weekend },
  { g: "moments", id: "music", icon: "🎵", title: "Меломан", text: "Послушай музыку в меню 10 минут", goal: 10, tier: 1, val: () => Math.floor(stats.musicMs / MIN) },

  { g: "secret", id: "magic", icon: "🪄", title: "Фокусник", text: "Нажми на логотип 7 раз подряд", goal: 1, tier: 2, secret: true, val: () => +stats.magic },
  { g: "secret", id: "share", icon: "💌", title: "Душа компании", text: "Поделись приложением с другом", goal: 1, tier: 1, secret: true, val: () => +stats.shared },
  { g: "secret", id: "quick", icon: "⚡", title: "Быстрый старт", text: "Запусти игру ярлыком с иконки приложения", goal: 1, tier: 2, secret: true, val: () => +stats.shortcut },
  { g: "secret", id: "comeback", icon: "🦋", title: "Возвращение", text: "Вернись поиграть после недели перерыва", goal: 1, tier: 2, secret: true, val: () => +stats.comeback },
  { g: "secret", id: "newyear", icon: "🎄", title: "Новогоднее чудо", text: "Сыграй 31 декабря или 1 января", goal: 1, tier: 3, secret: true, val: () => +stats.newyear },
  { g: "secret", id: "collector", icon: "🌟", title: "Коллекционер наград", text: "Получи 40 достижений", goal: 40, tier: 3, secret: true, val: () => awards.filter(a => a.id !== "collector" && isGot(a)).length },
];

// Однажды полученное достижение остаётся навсегда (даже если убрать игру из избранного)
let gotSet = new Set(store.get("ap:awards", []));
const isGot = a => gotSet.has(a.id) || a.val() >= a.goal;

// Выдаёт новые достижения с тостом и конфетти
function checkAwards() {
  let fresh = [];
  // два прохода: «Коллекционер» зависит от остальных
  for (let pass = 0; pass < 2; pass++) {
    const now = awards.filter(a => !gotSet.has(a.id) && a.val() >= a.goal);
    now.forEach(a => gotSet.add(a.id));
    fresh = fresh.concat(now);
  }
  if (!fresh.length) return;
  store.set("ap:awards", [...gotSet]);
  store.set("ap:awardsNew", true);
  const inbox = store.get("ap:inbox", []);
  fresh.forEach(a => inbox.unshift({ game: null, icon: a.icon, title: a.secret ? "Секретное достижение!" : "Новое достижение!", text: a.title, t: Date.now(), read: false }));
  store.set("ap:inbox", inbox.slice(0, 100));
  renderBell(true);
  document.getElementById("awardsDot").hidden = false;
  const shown = fresh.slice(0, 3);
  shown.forEach((a, i) => setTimeout(() => {
    toast(a.icon, a.secret ? "Секретное достижение!" : "Новое достижение!", a.title);
    confetti();
    haptic([20, 60, 30]);
    sound("win");
  }, 700 + i * 1600));
  if (fresh.length > 3) setTimeout(() => toast("🏅", `И ещё ${fresh.length - 3} ${plural(fresh.length - 3, "достижение", "достижения", "достижений")}`, "Загляни во вкладку «Награды»"), 700 + 3 * 1600);
}

/* ================= Отклик: вибрация и звук ================= */

const bridge = window.AndroidApp;
function haptic(p = 10) {
  if (!settings.haptics) return;
  try { bridge ? bridge.vibrate(Array.isArray(p) ? p.join(",") : String(p)) : navigator.vibrate?.(p); } catch {}
}
let actx;
// Звуки меню: мягкие «деревянные» щелчки (как маримба), не похожие на игровые писки
function sound(kind = "tap") {
  if (!settings.sounds) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { tap: [[392, .09]], tab: [[523, .07]], fav: [[523, .1], [784, .14]], win: [[392, .12], [523, .12], [659, .12], [784, .3]] }[kind];
    let t = actx.currentTime;
    for (const [f, d] of notes) { mallet(actx, actx.destination, f, t, d, .11); t += d * .75; }
  } catch {}
}
// Удар маримбы: основной тон + обертон ×4, быстрое затухание и лёгкий «стук» в начале
function mallet(ctx, out, f, t, d, vol) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + .004);
  g.gain.exponentialRampToValueAtTime(.0001, t + d + .25);
  g.connect(out);
  [[1, 1], [3.98, .18], [9.9, .05]].forEach(([r, v]) => {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine"; o.frequency.value = f * r;
    og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(.0001, t + (r > 1 ? .08 : d + .25));
    o.connect(og).connect(g); o.start(t); o.stop(t + d + .3);
  });
}
function openExternal(u) {
  try { bridge ? bridge.openUrl(u) : window.open(u, "_blank"); } catch { location.href = u; }
}


/* ================= Фоновая музыка ================= */

// Спокойный lo-fi, который генерируется прямо в приложении: электропиано с джазовыми
// аккордами, мягкий бас и тихий треск винила. Специально не похоже на звуки игр.
// Файлов нет, работает офлайн.
const ambient = (() => {
  let ctx, master, out, crackle, timer, step = 0, on = false;
  // Dm9 → G13 → Cmaj9 → Am9 (бас отдельно)
  const CHORDS = [
    { bass: 38, keys: [53, 57, 60, 64] },
    { bass: 43, keys: [53, 59, 64, 69] },
    { bass: 36, keys: [52, 55, 59, 62] },
    { bass: 45, keys: [55, 60, 64, 71] },
  ];
  const BPM = 70, BEAT = 60 / BPM, BAR = BEAT * 4;
  // Ритм аккордов в долях такта: немного «раскачанный»
  const RHYTHMS = [[0, 2.5], [0, 1.5, 3], [0.5, 2.5], [0, 3]];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    ctx = actx;
    master = ctx.createGain(); master.gain.value = 0;
    // Тёплый «ламповый» звук: срезаем верха, как на старой кассете
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2600; tone.Q.value = .5;
    out = ctx.createGain(); out.gain.value = 1;
    out.connect(tone); tone.connect(master); master.connect(ctx.destination);
    // Комната
    const delay = ctx.createDelay(1), fb = ctx.createGain(), damp = ctx.createBiquadFilter();
    delay.delayTime.value = BEAT * .75; fb.gain.value = .28; damp.type = "lowpass"; damp.frequency.value = 1400;
    out.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(tone);
    // Треск винила: редкие щелчки и тихий шум в бесконечной петле
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * .012 + (Math.random() < .0004 ? (Math.random() * 2 - 1) * .5 : 0);
    crackle = ctx.createBufferSource(); crackle.buffer = buf; crackle.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = .6;
    const cg = ctx.createGain(); cg.gain.value = .35;
    crackle.connect(bp).connect(cg).connect(master); crackle.start();
  }

  // Электропиано (как Rhodes): частотная модуляция, яркая атака и мягкий хвост
  function epiano(n, t, vel) {
    const f = hz(n);
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.type = "sine"; mod.type = "sine";
    car.frequency.value = f; mod.frequency.value = f * 1.0; car.detune.value = (Math.random() - .5) * 8;
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * .08, t + 1.2);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.06 * vel, t + .008);
    g.gain.exponentialRampToValueAtTime(.025 * vel, t + .5);
    g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
    mod.connect(mg).connect(car.frequency);
    car.connect(g).connect(out);
    car.start(t); mod.start(t); car.stop(t + 3.3); mod.stop(t + 3.3);
  }

  function bass(n, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "triangle"; o.frequency.value = hz(n);
    f.type = "lowpass"; f.frequency.value = 400;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.16, t + .03);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + .05);
  }

  function schedule() {
    const t0 = ctx.currentTime + .1;
    const c = CHORDS[step % CHORDS.length];
    const rhythm = RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)];
    rhythm.forEach((beat, i) => {
      const t = t0 + beat * BEAT;
      // Аккорд «перебором»: ноты чуть-чуть врозь, как живой пианист
      c.keys.forEach((n, j) => epiano(n, t + j * .018 + Math.random() * .01, i ? .7 : 1));
    });
    bass(c.bass, t0, BEAT * 2.6);
    bass(c.bass + (Math.random() < .5 ? 7 : 12), t0 + BEAT * 3, BEAT * .9);
    // Иногда короткая мелодия сверху
    if (Math.random() < .55) {
      const pick = () => c.keys[Math.floor(Math.random() * c.keys.length)] + 12;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) epiano(pick(), t0 + (1 + i * .5 + Math.random() * .25) * BEAT, .55);
    }
    step++;
  }

  return {
    start() {
      if (!settings.music) return;
      if (on) { try { ctx.resume(); } catch {} return; }
      try {
        if (!ctx) init();
        ctx.resume();
        on = true;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(.7, ctx.currentTime, 1.2);
        schedule();
        timer = setInterval(schedule, BAR * 1000);
      } catch {}
    },
    stop(fast) {
      if (!on) return;
      on = false;
      clearInterval(timer);
      try { master.gain.setTargetAtTime(0, ctx.currentTime, fast ? .08 : .5); } catch {}
    },
    get playing() { return on; },
  };
})();

// Браузер может не дать включить звук до первого касания: тогда стартуем по нему
function armMusic() {
  ambient.start();
  const kick = () => { ambient.start(); removeEventListener("pointerdown", kick); };
  addEventListener("pointerdown", kick);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) ambient.stop(true);
  else if (!busy) ambient.start();
});


/* ================= Уведомления ================= */

function ago(t) {
  const m = Math.round((Date.now() - t) / MIN);
  if (m < 1) return "сейчас";
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.round(h / 24);
  return `${d} ${plural(d, "день", "дня", "дней")}`;
}
function renderBell(ring) {
  const n = store.get("ap:inbox", []).filter(x => !x.read).length;
  const c = document.getElementById("bellCount");
  c.hidden = !n;
  c.textContent = n > 9 ? "9+" : n;
  const b = document.getElementById("bellBtn");
  if (ring && n) { b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring"); }
}
function openInbox() {
  haptic(); sound("tap");
  const inbox = store.get("ap:inbox", []);
  const list = document.getElementById("inboxList");
  list.innerHTML = "";
  if (!inbox.length) {
    list.innerHTML = `<div class="inbox-empty"><div>🔔</div>Здесь появятся рекорды, новые уровни и достижения из твоих игр.</div>`;
  }
  inbox.forEach((x, i) => {
    const g = x.game && byId[x.game];
    const el = document.createElement("div");
    el.className = "note" + (x.read ? "" : " unread");
    el.style.setProperty("--i", Math.min(i, 12));
    el.innerHTML = `<div class="ic"></div><div class="tx"><b></b><small></small></div><time>${ago(x.t)}</time>`;
    el.querySelector(".ic").textContent = x.icon;
    if (g) { const im = document.createElement("img"); im.src = img(g); im.alt = ""; el.querySelector(".ic").appendChild(im); }
    el.querySelector("b").textContent = x.title;
    el.querySelector("small").textContent = g ? `${g.title} · ${x.text}` : x.text;
    if (g) { el.style.cursor = "pointer"; el.onclick = () => { closeInbox(); launch(g, null); }; }
    list.appendChild(el);
  });
  document.getElementById("sheetBg").hidden = false;
  const sh = document.getElementById("inbox");
  sh.classList.remove("closing");
  sh.hidden = false;
  // всё прочитано
  store.set("ap:inbox", inbox.map(x => ({ ...x, read: true })));
  renderBell();
}
function closeInbox() {
  const sh = document.getElementById("inbox");
  if (sh.hidden) return;
  sh.classList.add("closing");
  document.getElementById("sheetBg").hidden = true;
  setTimeout(() => { sh.hidden = true; sh.classList.remove("closing"); }, 300);
}
document.getElementById("bellBtn").onclick = openInbox;
document.getElementById("sheetBg").onclick = closeInbox;
document.getElementById("inboxClear").onclick = () => { store.set("ap:inbox", []); haptic(); openInbox(); };
// Свайп вниз закрывает ленту
(() => {
  const sh = document.getElementById("inbox");
  let y0 = null;
  sh.addEventListener("touchstart", e => { if (document.getElementById("inboxList").scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener("touchmove", e => { if (y0 != null && e.touches[0].clientY - y0 > 70) { y0 = null; closeInbox(); } }, { passive: true });
  sh.addEventListener("touchend", () => { y0 = null; });
})();

/* ================= Напоминания на телефон ================= */

// Передаём приложению, когда играли последний раз: вечером оно напомнит про серию
function syncReminders(ask) {
  if (!bridge || !bridge.setReminder) return;
  try {
    if (ask) bridge.requestNotifications(); // и для напоминаний, и для новостей об обновлениях
    const last = [...stats.days].sort().pop() || "";
    bridge.setReminder(!!settings.reminders, last, streak());
  } catch {}
}

/* ================= Учёт сессий ================= */

// Когда возвращаемся из игры, засчитываем время (не больше 3 часов за раз)
function closeSession() {
  const s = store.get("ap:session", null);
  if (!s) return;
  store.del("ap:session");
  const ms = Math.min(Math.max(Date.now() - s.t, 0), 3 * 3600e3);
  stats.time[s.id] = (stats.time[s.id] || 0) + ms;
  stats.longest = Math.max(stats.longest, ms);
  store.set("ap:stats", stats);
}
function openSession(g) {
  const now = new Date();
  const today = dayKey(now), h = now.getHours();
  stats.plays[g.id] = (stats.plays[g.id] || 0) + 1;
  if (!stats.days.includes(today)) {
    const last = [...stats.days].sort().pop();
    if (last && (new Date(today + "T12:00:00") - new Date(last + "T12:00:00")) / 864e5 >= 7) stats.comeback = true;
    stats.days.push(today);
  }
  stats.days = stats.days.slice(-400);
  stats.dayPlays[today] = (stats.dayPlays[today] || 0) + 1;
  stats.dayGames[today] = [...new Set([...(stats.dayGames[today] || []), g.id])];
  // храним счётчики только за последние 60 дней
  for (const k of Object.keys(stats.dayPlays)) if (k < dayKey(new Date(Date.now() - 60 * 864e5))) { delete stats.dayPlays[k]; delete stats.dayGames[k]; }
  if (h < 4) stats.night = true;
  if (h >= 4 && h < 7) stats.early = true;
  if (h >= 12 && h < 14) stats.lunch = true;
  if (now.getDay() === 0 || now.getDay() === 6) stats.weekend = true;
  if ((now.getMonth() === 11 && now.getDate() === 31) || (now.getMonth() === 0 && now.getDate() === 1)) stats.newyear = true;
  store.set("ap:stats", stats);
  store.set("ap:session", { id: g.id, t: Date.now() });
  syncReminders(false);
  recent = [g.id, ...recent.filter(x => x !== g.id)].slice(0, games.length);
  store.set("ap:recent", recent);
}

// Отмечает разовое событие для достижения и сразу проверяет награды
function mark(flag) {
  if (stats[flag]) return;
  stats[flag] = true;
  store.set("ap:stats", stats);
  checkAwards();
}

/* ================= Шапка ================= */

function renderHeader() {
  const h = new Date().getHours();
  document.getElementById("greet").textContent =
    h < 5 ? "Доброй ночи!" : h < 12 ? "Доброе утро!" : h < 18 ? "Добрый день!" : "Добрый вечер!";
  const s = streak();
  const chip = document.getElementById("streakChip");
  chip.innerHTML = `<span class="fire">🔥</span>${s}`;
  chip.classList.toggle("cold", s === 0);
  chip.title = s ? `Серия: ${s} ${plural(s, "день", "дня", "дней")} подряд` : "Сыграй сегодня, чтобы начать серию";
  chip.onclick = () => {
    haptic();
    toast("🔥", s ? `${s} ${plural(s, "день", "дня", "дней")} подряд!` : "Серии пока нет", s ? "Заходи завтра, чтобы не прервать серию" : "Сыграй сегодня, чтобы начать серию");
  };
}

/* ================= Вкладка «Игры» ================= */

function gameOfDay() {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return games[n % games.length];
}

function renderHero() {
  const last = byId[recent[0]];
  const g = last || gameOfDay();
  const hero = document.getElementById("hero");
  hero.style.setProperty("--accent", g.accent);
  const t = stats.time[g.id];
  hero.innerHTML = `
    <img class="backdrop" src="${img(g)}" alt="">
    <div class="frame">
      <img src="${img(g)}" alt="">
      <span class="pill"><span class="dot"></span>${last ? "Ты играл недавно" : "Игра дня"}</span>
    </div>
    <div class="body">
      <div class="text"><h2></h2><p></p>${last && t ? `<div class="meta">Ты уже провёл здесь ${fmtTime(t)}</div>` : ""}</div>
      <span class="play">${PLAY}${last ? "Продолжить" : "Играть"}</span>
    </div>`;
  hero.querySelector("h2").textContent = g.title;
  hero.querySelector("p").textContent = g.text;
  hero.onclick = () => launch(g, hero.querySelector(".frame img"));
}

let filter = store.get("ap:filter", "all");
function renderChips() {
  const tags = [...new Set(games.map(g => g.tag))];
  const items = [["all", "Все"], ["fav", "♥ Избранное"], ["recent", "Недавние"], ...tags.map(t => [t, t])];
  if (!items.some(([k]) => k === filter)) filter = "all";
  const box = document.getElementById("chips");
  box.innerHTML = "";
  for (const [k, label] of items) {
    const c = document.createElement("button");
    c.type = "button"; c.className = "chip" + (k === filter ? " on" : ""); c.textContent = label;
    c.onclick = () => {
      if (filter === k) return;
      filter = k; store.set("ap:filter", k);
      haptic(); sound("tab");
      box.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c));
      c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      renderGrid();
    };
    box.appendChild(c);
  }
}

function visibleGames() {
  if (filter === "all") return games;
  if (filter === "fav") return games.filter(g => favs.has(g.id));
  if (filter === "recent") return recent.map(id => byId[id]).filter(Boolean);
  return games.filter(g => g.tag === filter);
}

let io;
function renderGrid() {
  const list = visibleGames();
  const grid = document.getElementById("grid");
  const titles = { all: "Все игры", fav: "Избранное", recent: "Недавние" };
  document.getElementById("listTitle").textContent = titles[filter] || filter;
  document.getElementById("count").textContent = `${list.length} ${plural(list.length, "игра", "игры", "игр")}`;
  const empty = document.getElementById("empty");
  empty.hidden = list.length > 0;
  empty.querySelector("p").textContent = filter === "fav"
    ? "Нажми на сердечко у игры, и она появится здесь."
    : "Здесь появятся игры, в которые ты играл.";

  grid.innerHTML = "";
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -5% 0px" });

  list.forEach((g, i) => {
    const c = document.createElement("div");
    c.className = "card"; c.tabIndex = 0; c.setAttribute("role", "button");
    c.style.setProperty("--i", i);
    c.style.setProperty("--accent", g.accent);
    const t = stats.time[g.id], p = stats.plays[g.id];
    c.innerHTML = `
      <div class="cover-wrap">
        <img src="${img(g)}" alt="" loading="lazy">
        <span class="badge"></span>
        <button class="fav${favs.has(g.id) ? " on" : ""}" type="button" aria-label="В избранное">${HEART}</button>
      </div>
      <div class="info">
        <div class="text"><h4></h4><p></p>
          ${p ? `<div class="meta"><span>⏱ <b>${fmtTime(t || 0)}</b></span><span>▶ <b>${p}</b> ${plural(p, "запуск", "запуска", "запусков")}</span></div>` : ""}
        </div>
        <span class="go">${PLAY}</span>
      </div>`;
    c.querySelector("h4").textContent = g.title;
    c.querySelector("p").textContent = g.text;
    c.querySelector(".badge").textContent = recent[0] === g.id ? "Недавно" : g.tag;
    c.querySelector(".fav").onclick = e => { e.stopPropagation(); toggleFav(g, e.currentTarget, c); };
    c.onclick = () => launch(g, c.querySelector(".cover-wrap img"));
    grid.appendChild(c);
    io.observe(c);
  });
}

function toggleFav(g, btn, card) {
  const on = !favs.has(g.id);
  on ? favs.add(g.id) : favs.delete(g.id);
  store.set("ap:favs", [...favs]);
  btn.classList.toggle("on", on);
  btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
  haptic(on ? [10, 40, 15] : 8);
  sound(on ? "fav" : "tap");
  if (on) burst(btn);
  if (!on && filter === "fav") {
    card.classList.add("out");
    setTimeout(renderGrid, 300);
  }
  checkAwards();
}

/* ================= Запуск игры ================= */

let busy = false;
function launch(g, coverImg) {
  if (busy) return; busy = true;
  haptic(12); sound("tap");
  ambient.stop();
  openSession(g);

  const reduce = !settings.motion || matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!coverImg || reduce) { location.href = url(g); return; }
  const r = coverImg.getBoundingClientRect();
  const z = document.createElement("div");
  z.className = "zoom";
  z.style.setProperty("--accent", g.accent);
  Object.assign(z.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: "24px" });
  z.innerHTML = `<img src="${coverImg.src}" alt=""><div class="veil"></div><div class="spinner"></div>`;
  document.body.appendChild(z);
  document.body.classList.add("leaving");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    z.classList.add("full");
    Object.assign(z.style, { left: 0, top: 0, width: "100vw", height: "100vh", borderRadius: 0 });
  }));
  setTimeout(() => { location.href = url(g); }, 560);
}

/* ================= Вкладка «Награды» ================= */

function renderAwards() {
  const got = awards.filter(isGot).length;
  document.getElementById("ringNum").textContent = got;
  document.querySelector(".ring-text span").textContent = `из ${awards.length}`;
  document.getElementById("awardsCount").textContent = `${got} из ${awards.length}`;
  const fg = document.getElementById("ringFg");
  fg.style.strokeDashoffset = 327;
  requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = 327 * (1 - got / awards.length); }));

  const s = streak();
  document.getElementById("stats").innerHTML = [
    [fmtTime(totalTime()), "в играх"],
    [totalPlays(), plural(totalPlays(), "запуск", "запуска", "запусков")],
    [`${s} 🔥`, "серия дней"],
    [bestStreak(), "лучшая серия"],
  ].map(([b, t]) => `<div class="stat"><b>${b}</b><span>${t}</span></div>`).join("");

  const box = document.getElementById("awards");
  box.innerHTML = "";
  let i = 0;
  const card = a => {
    const got = isGot(a), hidden = a.secret && !got;
    const v = got ? a.goal : Math.min(a.val(), a.goal);
    const el = document.createElement("div");
    el.className = `award tier${a.tier}` + (got ? " got" : "") + (hidden ? " secret" : "");
    el.style.setProperty("--i", i++);
    el.innerHTML = `<div class="medal">${hidden ? "🔒" : a.icon}</div>
      <div class="t"><b></b><small></small><div class="prog"><i></i></div></div>`;
    el.querySelector("b").textContent = hidden ? "Секретное достижение" : a.title;
    el.querySelector("small").textContent = hidden ? "Узнаешь, когда получишь" : a.text + (a.goal > 1 && !got ? ` · ${v}/${a.goal}` : "");
    requestAnimationFrame(() => requestAnimationFrame(() => { el.querySelector(".prog i").style.width = `${hidden ? 0 : (v / a.goal) * 100}%`; }));
    return el;
  };
  const section = (title, list, extra = "") => {
    if (!list.length) return;
    const h = document.createElement("div");
    h.className = "award-group";
    h.innerHTML = `<span></span><em>${extra}</em>`;
    h.querySelector("span").textContent = title;
    box.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "awards-grid";
    list.forEach(a => grid.appendChild(card(a)));
    box.appendChild(grid);
  };
  // Ближайшие: три неполученных с самым большим прогрессом
  const near = awards.filter(a => !isGot(a) && !a.secret && a.val() > 0)
    .sort((a, b) => b.val() / b.goal - a.val() / a.goal).slice(0, 3);
  section("🎯 Почти получено", near);
  for (const [g, title] of awardGroups) {
    const list = awards.filter(a => a.g === g).sort((a, b) => isGot(b) - isGot(a) || a.tier - b.tier);
    section(title, list, `${list.filter(isGot).length}/${list.length}`);
  }

  const max = Math.max(1, ...games.map(g => stats.time[g.id] || 0));
  const bars = document.getElementById("bars");
  bars.innerHTML = "";
  [...games].sort((a, b) => (stats.time[b.id] || 0) - (stats.time[a.id] || 0)).forEach(g => {
    const t = stats.time[g.id] || 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.style.setProperty("--accent", g.accent);
    row.innerHTML = `<span class="name"></span><span class="track"><i></i></span><span class="val">${fmtTime(t)}</span>`;
    row.querySelector(".name").textContent = g.title;
    bars.appendChild(row);
    requestAnimationFrame(() => requestAnimationFrame(() => { row.querySelector("i").style.width = `${(t / max) * 100}%`; }));
  });

  store.del("ap:awardsNew");
  document.getElementById("awardsDot").hidden = true;
}

/* ================= Вкладка «Ещё» ================= */

function applySettings() {
  document.body.classList.toggle("calm", !settings.motion);
  document.querySelectorAll("[data-setting]").forEach(el => { el.checked = !!settings[el.dataset.setting]; });
}

function bindSettings() {
  document.querySelectorAll("[data-setting]").forEach(el => {
    el.onchange = () => {
      settings[el.dataset.setting] = el.checked;
      store.set("ap:settings", settings);
      applySettings();
      if (el.dataset.setting === "music") el.checked ? ambient.start() : ambient.stop();
      if (el.dataset.setting === "reminders") syncReminders(el.checked);
      haptic(); sound("tap");
    };
  });
  document.querySelectorAll("[data-open]").forEach(el => { el.onclick = () => { haptic(); openExternal(el.dataset.open); }; });
  document.getElementById("shareBtn").onclick = () => {
    haptic();
    mark("shared");
    const text = `Залетай в Andreos Play: все игры Andreos в одном приложении 🎮\n${RELEASE_PAGE}`;
    try {
      if (bridge) bridge.share(text);
      else if (navigator.share) navigator.share({ text });
      else { navigator.clipboard.writeText(text); toast("📋", "Ссылка скопирована", "Отправь её другу"); }
    } catch {}
  };
  document.getElementById("updateBtn").onclick = () => { haptic(); checkUpdate(true); };
  document.getElementById("resetBtn").onclick = () => {
    if (!confirm("Сбросить время, серии и достижения? Прогресс внутри игр останется.")) return;
    ["ap:stats", "ap:awards", "ap:recent", "ap:session", "ap:awardsNew"].forEach(store.del);
    stats = loadStats(); recent = []; gotSet = new Set();
    haptic(20);
    renderAll();
    toast("🧹", "Статистика сброшена", "Начинаем с чистого листа");
  };
  const v = appVersion();
  document.getElementById("versionLbl").textContent = v.name ? `Версия ${v.name}` : "Версия для браузера";
}

/* ================= Обновления ================= */

function appVersion() {
  try { return bridge ? { code: +bridge.versionCode(), name: bridge.versionName() } : { code: 0, name: "" }; }
  catch { return { code: 0, name: "" }; }
}

async function checkUpdate(manual) {
  const v = appVersion();
  if (!v.code) { if (manual) toast("ℹ️", "Это версия для браузера", "Обновления есть только в приложении"); return; }
  if (!manual) {
    const last = store.get("ap:updChecked", 0);
    if (Date.now() - last < 10 * 60e3) { const b = store.get("ap:updBuild", 0); if (b > v.code) showUpdate(b); return; }
  }
  store.set("ap:updChecked", Date.now());
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: "no-store" });
    if (!r.ok) throw 0;
    const rel = await r.json();
    const m = /сборка\s+(\d+)/i.exec(rel.name || "");
    const latest = m ? +m[1] : 0;
    store.set("ap:updBuild", latest);
    if (latest > v.code) {
      showUpdate(latest);
      // Один раз на каждую новую сборку: запись в 🔔 и всплывающее сообщение
      if (store.get("ap:updNotified", 0) < latest) {
        store.set("ap:updNotified", latest);
        const inbox = store.get("ap:inbox", []);
        inbox.unshift({ game: null, icon: "🚀", title: "Вышло обновление!", text: `Сборка ${latest} уже готова. Нажми «Скачать» вверху`, t: Date.now(), read: false });
        store.set("ap:inbox", inbox.slice(0, 100));
        renderBell(true);
        toast("🚀", "Вышло обновление!", `Сборка ${latest} уже готова`);
      }
    }
    else if (manual) toast("✅", "У тебя последняя версия", `Версия ${v.name}`);
  } catch {
    if (manual) toast("📡", "Не получилось проверить", "Нужен интернет");
  }
}
function showUpdate(build) {
  const b = document.getElementById("updateBanner");
  b.hidden = false;
  b.innerHTML = `<span style="font-size:26px">🚀</span><div class="txt"><b>Вышло обновление</b><small>Новая сборка ${build} уже готова</small></div><button type="button">Скачать</button>`;
  b.querySelector("button").textContent = bridge && bridge.downloadUpdate ? "Обновить" : "Скачать";
  b.querySelector("button").onclick = () => { haptic(); startUpdate(build); };
}

// Обновление внутри приложения: скачиваем, показываем прогресс и открываем установщик.
// Старые сборки обновляются поверх, а установочный файл приложение удалит само.
let updTimer = null;
function startUpdate(build) {
  if (!bridge || !bridge.downloadUpdate) { openExternal(APK_URL); return; }
  if (updTimer) return;
  const b = document.getElementById("updateBanner");
  b.hidden = false;
  const paint = (title, sub, pct, btn) => {
    b.innerHTML = `<span style="font-size:26px">🚀</span><div class="txt"><b>${title}</b><small>${sub}</small>` +
      (pct != null ? `<i class="upd-bar"><i style="width:${pct}%"></i></i>` : "") + `</div>` + (btn ? `<button type="button">${btn}</button>` : "");
  };
  try { bridge.downloadUpdate(build || store.get("ap:updBuild", 0)); } catch { openExternal(APK_URL); return; }
  paint("Скачиваю обновление", "Можно пока поиграть", 0);
  updTimer = setInterval(() => {
    let st; try { st = JSON.parse(bridge.updateStatus()); } catch { st = { state: "failed" }; }
    if (st.state === "running" || st.state === "none") { paint("Скачиваю обновление", `${st.pct}%`, st.pct); return; }
    clearInterval(updTimer); updTimer = null;
    if (st.state === "done") {
      paint("Обновление скачано", "Нажми «Установить» в окне Android", 100, "Установить");
      const install = () => { haptic(); try { bridge.installUpdate(); } catch {} };
      b.querySelector("button").onclick = install;
      install();
    } else {
      paint("Не получилось скачать", "Проверь интернет и попробуй ещё раз", null, "Ещё раз");
      b.querySelector("button").onclick = () => startUpdate(build);
    }
  }, 500);
}

// Первый запуск после обновления: приложение удаляет установочный файл и сообщает об этом
function afterUpdate() {
  if (!bridge || !bridge.cleanupUpdates) return;
  let r; try { r = bridge.cleanupUpdates(); } catch { return; }
  if (!r) return;
  const { build, mb } = JSON.parse(r);
  const text = `Установлена сборка ${build}. Старый установочный файл удалён` + (mb ? `, освобождено ${String(mb).replace(".", ",")} МБ` : "");
  const inbox = store.get("ap:inbox", []);
  inbox.unshift({ game: null, icon: "✅", title: "Приложение обновлено", text, t: Date.now(), read: false });
  store.set("ap:inbox", inbox.slice(0, 100));
  renderBell(true);
  setTimeout(() => { toast("✅", "Приложение обновлено", text); confetti(); }, 900);
}

/* ================= Нижнее меню ================= */

let tab = "games";
function go(name, initial) {
  if (name === tab && !initial) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  tab = name;
  if (!stats.tabs.includes(name)) { stats.tabs.push(name); store.set("ap:stats", stats); setTimeout(checkAwards, 400); }
  document.querySelectorAll(".tab").forEach(s => { s.hidden = s.dataset.tab !== name; });
  const btns = [...document.querySelectorAll(".tabbar button")];
  btns.forEach(b => b.classList.toggle("on", b.dataset.go === name));
  moveGlow();
  if (!initial) { haptic(8); sound("tab"); window.scrollTo({ top: 0 }); }
  if (name === "awards") renderAwards();
}
function moveGlow() {
  const b = document.querySelector(".tabbar button.on");
  const glow = document.getElementById("tabGlow");
  if (!b) return;
  glow.style.width = b.offsetWidth + "px";
  glow.style.transform = `translateX(${b.offsetLeft - 6}px)`;
}
document.querySelectorAll(".tabbar button").forEach(b => { b.onclick = () => go(b.dataset.go); });
addEventListener("resize", moveGlow);

/* ================= Тосты и конфетти ================= */

function toast(icon, title, sub) {
  const box = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="big">${icon}</span><div><b></b><small></small></div>`;
  t.querySelector("b").textContent = title;
  t.querySelector("small").textContent = sub || "";
  box.appendChild(t);
  const bye = () => { t.classList.add("bye"); setTimeout(() => t.remove(), 400); };
  t.onclick = bye;
  setTimeout(bye, 3200);
}

const cv = document.getElementById("confetti");
const cx = cv.getContext("2d");
let parts = [], raf = 0;
function confettiLoop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.vy += .25 * devicePixelRatio; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
    cx.globalAlpha = Math.min(1, p.life / 30);
    cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    cx.restore();
  }
  raf = parts.length ? requestAnimationFrame(confettiLoop) : 0;
}
function spawn(x, y, n, spread, power) {
  if (!settings.motion) return;
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  const colors = ["#8b5cff", "#ff4f9a", "#ffc42e", "#35d0ba", "#ffffff", "#2bff7a"];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * spread;
    const v = (Math.random() * .6 + .4) * power * devicePixelRatio;
    parts.push({ x: x * devicePixelRatio, y: y * devicePixelRatio, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      r: Math.random() * 6, vr: (Math.random() - .5) * .4, s: (Math.random() * 6 + 6) * devicePixelRatio,
      c: colors[i % colors.length], life: 90 + Math.random() * 40 });
  }
  if (!raf) raf = requestAnimationFrame(confettiLoop);
}
function confetti() { spawn(innerWidth / 2, innerHeight * .35, 140, Math.PI * 1.6, 16); }
function burst(el) { const r = el.getBoundingClientRect(); spawn(r.left + r.width / 2, r.top + r.height / 2, 24, Math.PI * 2, 7); }

/* ================= Старт ================= */

function renderAll() {
  renderHeader();
  renderHero();
  renderChips();
  renderGrid();
  if (tab === "awards") renderAwards();
  document.getElementById("awardsDot").hidden = !store.get("ap:awardsNew", false);
  renderBell();
}

// Секрет: 7 быстрых нажатий на логотип
let logoTaps = 0, logoTimer;
document.querySelector(".logo").addEventListener("click", e => {
  const el = e.currentTarget;
  logoTaps++;
  clearTimeout(logoTimer);
  logoTimer = setTimeout(() => { logoTaps = 0; }, 1500);
  el.animate([{ transform: "rotate(0) scale(1)" }, { transform: `rotate(${logoTaps % 2 ? 12 : -12}deg) scale(1.12)` }, { transform: "rotate(0) scale(1)" }], { duration: 300 });
  haptic(6);
  if (logoTaps >= 7) { logoTaps = 0; burst(el); mark("magic"); }
});

// Сколько музыки послушали в меню (для «Меломана»)
setInterval(() => {
  if (!document.hidden && ambient.playing) {
    stats.musicMs += 10000;
    store.set("ap:stats", stats);
    if (stats.musicMs % 60000 === 0) checkAwards();
  }
}, 10000);

function boot() {
  closeSession();
  applySettings();
  bindSettings();
  renderAll();
  go("games", true);
  requestAnimationFrame(moveGlow);
  checkAwards();
  renderBell(true);
  armMusic();
  // Разрешение на уведомления спрашиваем один раз, после первой игры
  setTimeout(() => syncReminders(totalPlays() > 0 && !store.get("ap:askedNotif", false) && (store.set("ap:askedNotif", true), true)), 2500);
  afterUpdate();
  const updBuild = +new URLSearchParams(location.search).get("update");
  if (updBuild) {
    // Открыли из уведомления «Вышло обновление»: сразу начинаем обновление
    history.replaceState(null, "", location.pathname);
    store.set("ap:updBuild", updBuild);
    setTimeout(() => startUpdate(updBuild), 600);
  } else setTimeout(() => checkUpdate(false), 1500);

  // Запуск с ярлыка на иконке приложения: ?play=<id>
  const want = new URLSearchParams(location.search).get("play");
  if (want && byId[want]) {
    history.replaceState(null, "", location.pathname);
    stats.shortcut = true;
    openSession(byId[want]);
    location.replace(url(byId[want]));
  }
}

// Вернулись «Назад» из игры, а страница взялась из кэша
addEventListener("pageshow", e => {
  if (!e.persisted) return;
  busy = false;
  document.querySelectorAll(".zoom").forEach(z => z.remove());
  document.body.classList.remove("leaving");
  stats = loadStats(); recent = store.get("ap:recent", []);
  closeSession(); renderAll(); checkAwards(); renderBell(true);
  ambient.start();
});

// Кнопка «Назад» на телефоне сначала закрывает ленту уведомлений
window.andreosBack = () => {
  if (!document.getElementById("inbox").hidden) { closeInbox(); return true; }
  return false;
};

boot();
