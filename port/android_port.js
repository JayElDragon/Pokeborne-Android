/* Pokeborne Android port (JayElDragon). Runs first on every page.
   The game already has a native (Capacitor) path: flagging it skips the service worker (it cannot reach
   the APK files), the online update banner and Google sign-in, and keeps the landscape lock. */
/* The "Made for computer" phone warning is dismissed for good (the Odin has a built-in controller). */
/* Statistics are off and their consent popup answered: the app has no internet permission anyway. */
try {
  localStorage.setItem('pokeborne.avisMobile', '1');
  localStorage.setItem('pb-stats', 'off');
  localStorage.setItem('pb-stats-vu', '1');
} catch (e) {}
window.Capacitor = window.Capacitor || { isNativePlatform: function () { return true; }, getPlatform: function () { return 'android'; } };
/* On-screen controls: the game builds its touch pad on the first touch only. On a run page, show it right
   away with a synthetic touch on <body> (only the "touch mode on" branch of the game's handler runs).
   Using the physical controller hides it again (game logic), touching the screen brings it back. */
addEventListener('load', function () {
  if (!/[?&]mode=/.test(location.search)) return;
  setTimeout(function () {
    if (document.body.classList.contains('touchNow')) return;
    try {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 999, bubbles: true, clientX: 1, clientY: 1 }));
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 999, bubbles: true, clientX: 1, clientY: 1 }));
    } catch (e) {}
  }, 1500);
});
/* Performance options (Home screen pill "Performance"): refresh rate, graphics preset and an FPS limit, for
   weaker phones or a cooler / longer-lasting handheld. Applied at page load through the patched render chunk:
   window.__pbMaxPR caps the render resolution, window.__pbMinPalier keeps the game's own quality tier at or above
   a level (1: shadows every 2nd frame, less rain · 2: + no MSAA, one post pass off · 3: + no shadows, little rain).
   The game's automatic quality still works inside those limits.
   120 Hz: the game draws twice as many frames, so it also caps at 1.25x / tier 2 (measured on the Odin: GPU
   660 MHz / ~71% busy, same as 60 Hz; unmodified 120 Hz ran 1.1 GHz / 93%).
   30 FPS limit: requestAnimationFrame only fires every ~33 ms. The game is time-based (THREE.Timer), so it
   runs at normal speed, just less smooth.
   Storage: refresh rate in the Android app (AndroidPort bridge), the rest in localStorage "pb-port-perf". */
(function () {
  var PRESETS = {
    high: { name: 'High', pr: 2, tier: 0, info: 'Full resolution and effects' },
    bal: { name: 'Balanced', pr: 1.5, tier: 1, info: 'Sharper than Low, lighter shadows' },
    low: { name: 'Low', pr: 1, tier: 2, info: 'Lower resolution, no anti-aliasing' },
    vlow: { name: 'Very low', pr: 0.75, tier: 3, info: 'No shadows, minimum effects' }
  };
  var hz = 60, perf = { q: 'high', fps: 0 };
  try { hz = window.AndroidPort ? AndroidPort.getHz() : 60; } catch (e) {}
  try { var s = JSON.parse(localStorage.getItem('pb-port-perf') || 'null'); if (s && PRESETS[s.q]) perf = s; } catch (e) {}
  var p = PRESETS[perf.q], pr = p.pr, tier = p.tier;
  if (hz >= 90) {
    pr = Math.min(pr, parseFloat(localStorage.getItem('pb-port-pr120')) || 1.25);
    var mp = localStorage.getItem('pb-port-minp120');
    tier = Math.max(tier, mp === null ? 2 : +mp);
  }
  window.__pbMaxPR = pr;
  if (tier > 0) window.__pbMinPalier = tier;

  if (perf.fps === 30) {
    window.__pbFrameScale = 2;  /* auto-quality judges frames against 30 FPS, not 60 */
    /* Frame limiter: a vsync is either "on" (every callback queued for it runs: the game has several loops)
       or skipped (callbacks wait for the next one). Our id -> current native id, so cancelAnimationFrame
       keeps working. */
    var raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
    var next = 1, live = {}, on = -1e9, step = 1000 / 30 - 3;
    window.requestAnimationFrame = function (cb) {
      var id = next++;
      var tick = function (t) {
        if (t !== on) {
          if (t - on < step) { live[id] = raf(tick); return; }
          on = t;
        }
        delete live[id];
        cb(t);
      };
      live[id] = raf(tick);
      return id;
    };
    window.cancelAnimationFrame = function (id) { if (live[id]) { caf(live[id]); delete live[id]; } };
  }

  function summary() { return (hz >= 90 ? '120' : '60') + ' Hz · ' + p.name + (perf.fps === 30 ? ' · 30 FPS' : ''); }
  function seg(key, cur, items) {
    return '<div class="pbSeg" data-k="' + key + '">' + items.map(function (it) {
      return '<button type="button" data-v="' + it[0] + '" class="' + (String(it[0]) === String(cur) ? 'on' : '') + '">' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function open() {
    if (document.getElementById('pbPerf')) return;
    var st = { hz: hz >= 90 ? 120 : 60, q: perf.q, fps: perf.fps };
    var d = document.createElement('div');
    d.id = 'pbPerf';
    var render = function () {
      d.innerHTML = '<div class="pbBox"><h3>Performance</h3>' +
        '<label>Graphics</label>' + seg('q', st.q, [['high', 'High'], ['bal', 'Balanced'], ['low', 'Low'], ['vlow', 'Very low']]) +
        '<p class="pbInfo">' + PRESETS[st.q].info + '</p>' +
        '<label>Frame rate limit</label>' + seg('fps', st.fps, [[0, 'Off'], [30, '30 FPS']]) +
        '<p class="pbInfo">' + (st.fps === 30 ? 'Saves battery and heat, less smooth' : 'As smooth as the display allows') + '</p>' +
        '<label>Display</label>' + seg('hz', st.hz, [[60, '60 Hz'], [120, '120 Hz']]) +
        '<p class="pbInfo">' + (st.hz === 120 ? 'Smoother; graphics are capped to keep the same heat' : 'Cooler and quieter (recommended)') + '</p>' +
        '<div class="pbRow"><button type="button" class="pbCancel">Cancel</button><button type="button" class="tc-go pbApply">Apply</button></div></div>';
    };
    render();
    d.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target === d) { d.remove(); return; }
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      var segEl = b.closest('.pbSeg');
      if (segEl) {
        var k = segEl.dataset.k, v = b.dataset.v;
        st[k] = k === 'q' ? v : +v;
        render();
        return;
      }
      if (b.classList.contains('pbCancel')) { d.remove(); return; }
      if (b.classList.contains('pbApply')) {
        try { localStorage.setItem('pb-port-perf', JSON.stringify({ q: st.q, fps: st.fps })); } catch (err) {}
        try { localStorage.removeItem('pb-qualite-auto'); } catch (err) {}  /* let the game re-measure */
        try { if (window.AndroidPort) AndroidPort.setHz(st.hz); } catch (err) {}
        setTimeout(function () { location.reload(); }, 250);
      }
    });
    document.body.appendChild(d);
  }
  window.__pbPerfOpen = open;
  addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'portHz';
    b.innerHTML = '<span>Performance</span><small>' + summary() + '</small>';
    b.title = 'Performance options';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open(); });
    document.body.appendChild(b);
  });
})();
/* Touch layout editor. Pause a run in touch mode -> "Touch layout" (bottom left): drag any button, change the
   size and opacity of all of them, Reset, Done. Saved in localStorage "pb-port-touch" and re-applied each time
   the game builds its touch pad. Positions are offsets (CSS px) from the game's default spot. The movement
   stick is not edited: it is a floating stick that appears where the left thumb lands. */
(function () {
  var KEY = 'pb-port-touch';
  var cfg = { s: 1, o: 1, b: {} };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.b) cfg = saved; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  function idOf(el) { return el.dataset.k || el.id; }
  function items() {
    var t = document.getElementById('touch');
    return t ? [].slice.call(t.querySelectorAll('#tBtns .tb, #tBaie, #tPause')) : [];
  }
  function zoomOf(el) {
    var z = 1, p = el.parentElement;
    for (; p && p !== document.body; p = p.parentElement) { var v = parseFloat(getComputedStyle(p).zoom); if (v && v !== 1) z *= v; }
    return z;
  }
  function apply() {
    document.body.style.setProperty('--pbTouchOp', String(cfg.o));
    items().forEach(function (el) {
      var o = cfg.b[idOf(el)] || [0, 0], z = zoomOf(el);
      el.style.translate = (o[0] / z) + 'px ' + (o[1] / z) + 'px';
      el.style.scale = String(cfg.s);
    });
  }
  new MutationObserver(function () {
    var t = document.getElementById('touch');
    if (t && !t.__pbApplied) { t.__pbApplied = true; apply(); }
    var b = document.body;
    if (b && b.classList.contains('pbEdit') && !b.classList.contains('paused')) stop();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  var bar = null, drag = null;
  function label() {
    if (!bar) return;
    bar.querySelector('[data-v=s]').textContent = Math.round(cfg.s * 100) + '%';
    bar.querySelector('[data-v=o]').textContent = Math.round(cfg.o * 100) + '%';
  }
  function start() {
    if (!document.getElementById('touch')) return;
    document.body.classList.add('pbEdit');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pbEditBar';
      bar.innerHTML = '<b>Drag the buttons</b>' +
        '<span>Size <button data-a="s-">&minus;</button><i data-v="s"></i><button data-a="s+">+</button></span>' +
        '<span>Opacity <button data-a="o-">&minus;</button><i data-v="o"></i><button data-a="o+">+</button></span>' +
        '<button data-a="reset">Reset</button><button data-a="done" class="done">Done</button>';
      bar.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-a]');
        if (!a) return;
        e.stopPropagation();
        var k = a.dataset.a;
        if (k === 's-') cfg.s = Math.max(.7, Math.round((cfg.s - .1) * 10) / 10);
        if (k === 's+') cfg.s = Math.min(1.5, Math.round((cfg.s + .1) * 10) / 10);
        if (k === 'o-') cfg.o = Math.max(.3, Math.round((cfg.o - .1) * 10) / 10);
        if (k === 'o+') cfg.o = Math.min(1, Math.round((cfg.o + .1) * 10) / 10);
        if (k === 'reset') cfg = { s: 1, o: 1, b: {} };
        if (k === 'done') { stop(); return; }
        save(); apply(); label();
      });
      document.body.appendChild(bar);
    }
    label(); apply();
  }
  function stop() { document.body.classList.remove('pbEdit'); drag = null; save(); }

  /* Capture on window runs before the game's own handlers: in edit mode a touch on a button moves it
     instead of attacking or pausing. */
  addEventListener('pointerdown', function (e) {
    if (!document.body.classList.contains('pbEdit')) return;
    var el = e.target.closest && e.target.closest('#touch #tBtns .tb, #touch #tBaie, #touch #tPause');
    if (!el) return;
    e.stopImmediatePropagation(); e.preventDefault();
    var o = cfg.b[idOf(el)] || [0, 0];
    drag = { el: el, id: idOf(el), x: e.clientX, y: e.clientY, ox: o[0], oy: o[1] };
    el.classList.add('pbDrag');
  }, true);
  addEventListener('pointermove', function (e) {
    if (!drag) return;
    e.stopImmediatePropagation();
    var r = drag.el.getBoundingClientRect(), o = cfg.b[drag.id] || [0, 0];
    var nx = drag.ox + e.clientX - drag.x, ny = drag.oy + e.clientY - drag.y;
    var left = r.left + (nx - o[0]), top = r.top + (ny - o[1]);  /* keep the whole button on screen */
    if (left < 0) nx -= left;
    if (top < 0) ny -= top;
    if (left + r.width > innerWidth) nx -= left + r.width - innerWidth;
    if (top + r.height > innerHeight) ny -= top + r.height - innerHeight;
    cfg.b[drag.id] = [Math.round(nx), Math.round(ny)];
    apply();
  }, true);
  ['pointerup', 'pointercancel'].forEach(function (t) {
    addEventListener(t, function (e) {
      if (!drag) return;
      e.stopImmediatePropagation();
      drag.el.classList.remove('pbDrag'); drag = null; save();
    }, true);
  });
  addEventListener('keydown', function (e) {
    if (document.body.classList.contains('pbEdit') && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); stop(); }
  }, true);

  addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'pbEditBtn';
    b.textContent = 'Touch layout';
    b.addEventListener('click', function (e) { e.stopPropagation(); start(); });
    document.body.appendChild(b);
  });
})();
/* Local trainer name instead of the online account. The port is offline, so the sign-in / guest screens are
   replaced (patched compteUi chunk calls these hooks): first launch asks for a trainer name, the Home top bar
   shows it with a pencil to change it. Stored in localStorage "pb-port-name". Same rules as the game's own
   account names: 3 to 16 characters, letters, digits, space, dash. */
(function () {
  var KEY = 'pb-port-name';
  var OK = /^[\p{L}\p{N} -]{3,16}$/u;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function set(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    [].forEach.call(document.querySelectorAll('.tv-nom'), function (el) { el.textContent = v; });
    dispatchEvent(new Event('pb-meta'));
  }
  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  window.__pbName = function () { return get() || 'Trainer'; };

  /* Name form markup shared by the welcome card and the rename dialog. */
  function form(value, button) {
    return '<form class="pbName" autocomplete="off">' +
      '<input name="n" maxlength="16" spellcheck="false" placeholder="Trainer name" value="' + esc(value) + '">' +
      '<p class="pbNameHint">3 to 16 characters: letters, numbers, space, dash.</p>' +
      '<button type="submit" class="tc-go">' + button + '</button></form>';
  }
  function wire(root, done) {
    var f = root.querySelector('form.pbName'), inp = f.n, btn = f.querySelector('button');
    var check = function () { btn.disabled = !OK.test(clean(inp.value)); };
    inp.addEventListener('input', check);
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); });  /* typing must not drive the game */
    f.addEventListener('submit', function (e) {
      e.preventDefault(); e.stopPropagation();
      var v = clean(inp.value);
      if (!OK.test(v)) return;
      set(v); inp.blur(); done(v);
    });
    check();
    return inp;
  }

  /* Welcome card on the title screen (replaces Guest / Sign in). */
  window.__pbWelcome = function (card, play, rerender) {
    var name = get();
    if (name && !card.__pbEdit) {
      card.innerHTML = '<div class="tc-ban">Hi ' + esc(name) + '!</div>' +
        '<ul class="tc-l"><li><i>💾</i>Your progress is saved on this device.</li></ul>' +
        '<button type="button" class="tc-go">Play!</button><button type="button" class="tc-gerer">Change name</button>';
      card.querySelector('.tc-go').onclick = function () { play(); };
      card.querySelector('.tc-gerer').onclick = function () { card.__pbEdit = true; rerender(); };
      return;
    }
    card.innerHTML = '<div class="tc-ban">' + (name ? 'Change your name' : 'Welcome, trainer!') + '</div>' +
      '<ul class="tc-l"><li><i>✎</i>Choose your trainer name.</li><li><i>💾</i>Your progress is saved on this device.</li></ul>' +
      form(name, name ? 'Save' : 'Play!');
    var first = !name;
    var inp = wire(card, function () { card.__pbEdit = false; if (first) play(); else rerender(); });
    setTimeout(function () { if (!name) inp.focus(); }, 300);
  };

  /* Players who had already chosen "guest" before this version never see the welcome card again:
     ask them once on the Home screen. */
  addEventListener('load', function () {
    setTimeout(function () {
      var guest = false;
      try { guest = !!localStorage.getItem('pokeborne.invite'); } catch (e) {}
      if (!get() && guest && document.body.classList.contains('home') && !/[?&]mode=/.test(location.search)) window.__pbRename(null, true);
    }, 1500);
  });

  /* Pencil in the Home top bar: small dialog to change the name. */
  window.__pbRename = function (refresh, first) {
    if (document.getElementById('pbRename')) return;
    var d = document.createElement('div');
    d.id = 'pbRename';
    d.innerHTML = '<div class="pbBox"><h3>' + (first ? 'Choose your trainer name' : 'Trainer name') + '</h3>' +
      form(get(), 'Save') + (first ? '' : '<button type="button" class="pbCancel">Cancel</button>') + '</div>';
    document.body.appendChild(d);
    var close = function () { d.remove(); };
    d.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === d && !first) close(); });
    if (!first) d.querySelector('.pbCancel').onclick = close;
    var inp = wire(d, function () { close(); if (refresh) refresh(); });
    setTimeout(function () { inp.focus(); inp.select(); }, 50);
  };
})();
