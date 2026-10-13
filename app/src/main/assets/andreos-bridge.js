/* Andreos Play: мост между игрой и приложением.
 * Скрипт добавляется в каждую игру при сборке (scripts/fetch_games.sh).
 * Он следит за сохранениями игры, находит важные события (рекорд, новый уровень,
 * пройденная миссия), показывает уведомление поверх игры и складывает его в ленту
 * приложения (localStorage "ap:inbox"). Сами игры менять не нужно.
 */
(function () {
  "use strict";
  var id = (location.pathname.match(/\/games\/([^/]+)\//) || [])[1];
  if (!id) return;

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Для каждой игры: какой ключ читать, какие числа из него брать и какие события искать.
  // snap() превращает сохранение игры в плоский набор чисел, events() сравнивает старый и новый.
  var STAGES = ["Малёк", "Подросток", "Взрослая рыбка"];
  var RULES = {
    "doroga-v-okean": {
      snap: function () {
        var g = read("doroga-v-okean-1") || {}, c = g.cur || null;
        return {
          released: (g.released || []).length,
          lastReleased: (g.released || []).length ? g.released[g.released.length - 1].name || "" : "",
          fish: c ? c.name || "рыбка" : "",
          stage: c && c.stage != null ? c.stage : -1,
          weak: c && c.health != null && c.health < 30 ? 1 : 0,
        };
      },
      events: function (a, b) {
        var out = [];
        if (b.fish && b.fish !== a.fish && b.stage <= 0) out.push(["🐟", "Новый малёк", b.fish + " поселился в аквариуме"]);
        if (b.fish && b.fish === a.fish && b.stage > a.stage) out.push(["🌱", b.fish + " подрос", "Теперь это " + (STAGES[b.stage] || "большая рыбка").toLowerCase()]);
        if (b.released > a.released) out.push(["🌊", "Дорога в океан открыта!", (b.lastReleased || "Рыбка") + " уплыл(а) на свободу"]);
        if (b.weak && !a.weak) out.push(["⚠️", (b.fish || "Рыбке") + " нужна забота", "Проверь воду и корм"]);
        return out;
      },
    },
    "ButerBashnya-1.0": {
      snap: function () {
        var p = read("bb_save") || {};
        return { best: p.best || 0, coins: p.coins || 0, owned: (p.owned || []).length, combo: p.bestCombo || 0, games: p.games || 0 };
      },
      events: function (a, b) {
        var out = [];
        if (b.best > a.best && b.best >= 5) out.push(["🍔", "Новый рекорд!", "Башня из " + b.best + " этажей"]);
        if (b.owned > a.owned) out.push(["🎨", "Новая тема открыта", "Загляни в магазин Бутербашни"]);
        if (b.combo > a.combo && b.combo >= 5) out.push(["✨", "Комбо x" + b.combo, "Идеальные укладки подряд"]);
        if (Math.floor(b.coins / 100) > Math.floor(a.coins / 100)) out.push(["🪙", "Копилка растёт", "Уже " + b.coins + " монет"]);
        if (b.games >= 10 && a.games < 10) out.push(["🏗️", "10 башен построено", "Настоящий строитель"]);
        return out;
      },
    },
    "kimchi-gleba": {
      snap: function () {
        var s = read("glebKimchiCafe2") || {};
        return { level: s.level || 1, total: s.total || 0 };
      },
      events: function (a, b) {
        var out = [];
        if (b.level > a.level) out.push(["🥬", "Уровень " + b.level + " открыт", "Глеб Ли гордится тобой"]);
        if (Math.floor(b.total / 100) > Math.floor(a.total / 100)) out.push(["💰", "Касса кафе", "Заработано " + b.total + " монет"]);
        return out;
      },
    },
    "HackQuest-3.0": {
      snap: function () {
        var d = []; try { d = JSON.parse(localStorage.getItem("hq_done_v4") || "[]"); } catch (e) {}
        return { done: d.length };
      },
      events: function (a, b) {
        var out = [];
        if (b.done > a.done) {
          if (b.done >= 30) out.push(["🗿", "Проект OBELISK взломан!", "Все 30 миссий пройдены"]);
          else out.push(["💻", "Миссия выполнена", "Пройдено " + b.done + " из 30"]);
        }
        return out;
      },
    },
  };
  var rule = RULES[id];
  if (!rule) return;

  // Рекорды по играм для достижений приложения: храним максимум за всё время
  // (HackQuest, например, сам стирает прогресс через сутки).
  function bump(s) {
    var gp = read("ap:gp") || {};
    var m = {
      "doroga-v-okean": { fishReleased: s.released, fishStage: s.stage },
      "ButerBashnya-1.0": { buterBest: s.best, buterCoins: s.coins, buterThemes: s.owned },
      "kimchi-gleba": { kimchiLevel: s.level, kimchiCoins: s.total },
      "HackQuest-3.0": { hackDone: s.done },
    }[id];
    var changed = false;
    for (var k in m) if ((m[k] || 0) > (gp[k] || 0)) { gp[k] = m[k]; changed = true; }
    if (changed) write("ap:gp", gp);
  }

  var SNAP_KEY = "ap:snap:" + id;
  var prev = read(SNAP_KEY);
  var first = !prev;
  if (first) { prev = rule.snap(); write(SNAP_KEY, prev); } // первый запуск: старый прогресс не считаем событиями
  bump(prev);

  function tick() {
    var cur = rule.snap();
    if (JSON.stringify(cur) === JSON.stringify(prev)) return;
    var evs = rule.events(prev, cur);
    prev = cur;
    write(SNAP_KEY, cur);
    bump(cur);
    // в ленту сразу (вдруг игру сейчас закроют), а на экран по очереди
    evs.forEach(function (e) { toInbox(e[0], e[1], e[2]); });
    evs.forEach(function (e, i) { setTimeout(function () { notify(e[0], e[1], e[2]); }, i * 2600); });
  }
  setInterval(tick, 1500);
  addEventListener("pagehide", tick);

  /* ---------- кнопка выхода в меню ---------- */

  // Видна во всех играх. Через 3 секунды становится полупрозрачной, её можно перетащить.
  function exitButton() {
    var h = document.createElement("div");
    h.style.cssText = "position:fixed;z-index:2147483646;left:0;top:0;width:0;height:0";
    var r = h.attachShadow ? h.attachShadow({ mode: "open" }) : h;
    var st = document.createElement("style");
    st.textContent =
      "button{position:fixed;display:flex;align-items:center;gap:6px;padding:9px 14px 9px 11px;border-radius:999px;" +
      "border:1px solid rgba(255,255,255,.25);background:rgba(16,12,30,.78);color:#fff;font:700 14px system-ui,-apple-system,Roboto,sans-serif;" +
      "-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 8px 24px rgba(0,0,0,.45),0 0 18px -6px #8b5cff;" +
      "touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;transition:opacity .4s,transform .2s;" +
      "animation:in .5s cubic-bezier(.34,1.56,.64,1) both}" +
      "button.dim{opacity:.45}button:active{transform:scale(.92)}svg{width:18px;height:18px;fill:#fff}" +
      "@keyframes in{from{opacity:0;transform:translateX(-30px) scale(.8)}}";
    r.appendChild(st);
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", "Выйти в меню Andreos Play");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.4 4.6a1.5 1.5 0 0 1 0 2.1L10.1 12l5.3 5.3a1.5 1.5 0 1 1-2.1 2.1l-6.4-6.4a1.5 1.5 0 0 1 0-2.1l6.4-6.4a1.5 1.5 0 0 1 2.1 0z"/></svg>Игры';
    r.appendChild(b);
    (document.body || document.documentElement).appendChild(h);

    var POS = "ap:exitpos:" + id;
    var pos = read(POS) || { x: 12, y: 12 };
    function place() {
      var w = b.offsetWidth || 90, hh = b.offsetHeight || 38;
      pos.x = Math.max(6, Math.min(innerWidth - w - 6, pos.x));
      pos.y = Math.max(6, Math.min(innerHeight - hh - 6, pos.y));
      b.style.left = pos.x + "px";
      b.style.top = "calc(env(safe-area-inset-top) + " + pos.y + "px)";
    }
    place();
    addEventListener("resize", place);

    var dimT;
    function wake() { b.classList.remove("dim"); clearTimeout(dimT); dimT = setTimeout(function () { b.classList.add("dim"); }, 3000); }
    wake();

    // Перетаскивание: если палец сдвинулся больше чем на 8px, это не нажатие
    var drag = null, moved = false;
    b.addEventListener("pointerdown", function (e) {
      drag = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y }; moved = false; wake();
      try { b.setPointerCapture(e.pointerId); } catch (er) {}
    });
    b.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      moved = true;
      pos.x = drag.x + dx; pos.y = drag.y + dy; place();
    });
    b.addEventListener("pointerup", function () {
      if (!drag) return;
      drag = null;
      if (moved) { write(POS, pos); wake(); return; }
      exit();
    });
    b.addEventListener("pointercancel", function () { drag = null; });
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
  }

  function exit() {
    tick();
    try { window.AndroidApp && window.AndroidApp.vibrate("12"); } catch (e) {}
    document.documentElement.style.transition = "opacity .25s";
    document.documentElement.style.opacity = "0";
    setTimeout(function () { location.href = "../../index.html"; }, 220);
  }

  if (document.body) exitButton(); else addEventListener("DOMContentLoaded", exitButton);

  /* ---------- уведомление поверх игры ---------- */

  var host, root, queue = 0;
  function ui() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;pointer-events:none";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = document.createElement("style");
    st.textContent =
      ".n{display:flex;align-items:center;gap:12px;margin:calc(env(safe-area-inset-top) + 12px) auto 0;max-width:420px;width:calc(100% - 32px);" +
      "padding:12px 16px;border-radius:20px;background:rgba(24,19,40,.92);color:#f6f3ff;font:15px system-ui,-apple-system,Roboto,sans-serif;" +
      "border:1px solid rgba(139,92,255,.5);box-shadow:0 16px 40px -10px rgba(0,0,0,.7),0 0 30px -10px rgba(139,92,255,.8);" +
      "-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);pointer-events:auto;" +
      "animation:in .55s cubic-bezier(.34,1.56,.64,1) both}" +
      ".n.out{animation:out .35s ease forwards}.i{font-size:28px;line-height:1}.t b{display:block;font-weight:800}" +
      ".t small{color:#b7acd6;font-size:13px}.a{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.06em;color:#8b5cff;text-transform:uppercase}" +
      "@keyframes in{from{opacity:0;transform:translateY(-40px) scale(.9)}}@keyframes out{to{opacity:0;transform:translateY(-30px)}}";
    root.appendChild(st);
    (document.body || document.documentElement).appendChild(host);
  }
  function toInbox(icon, title, text) {
    var inbox = read("ap:inbox") || [];
    inbox.unshift({ game: id, icon: icon, title: title, text: text, t: Date.now(), read: false });
    write("ap:inbox", inbox.slice(0, 100));
  }
  function notify(icon, title, text) {
    try { ui(); } catch (e) { return; }
    var n = document.createElement("div");
    n.className = "n";
    n.innerHTML = '<span class="i"></span><span class="t"><b></b><small></small></span><span class="a">Andreos</span>';
    n.querySelector(".i").textContent = icon;
    n.querySelector("b").textContent = title;
    n.querySelector("small").textContent = text;
    root.appendChild(n);
    try { window.AndroidApp && window.AndroidApp.vibrate("15,50,25"); } catch (e) {}
    var bye = function () { n.className = "n out"; setTimeout(function () { n.remove(); }, 350); };
    n.onclick = bye;
    setTimeout(bye, 3400);
  }
})();
