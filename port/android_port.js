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
/* Refresh rate option (60 Hz default, 120 Hz optional). At 120 Hz the game draws twice as many frames, so the
   patched render chunk caps resolution at 1.25x (window.__pbMaxPR) and quality tier at >= 2 (window.__pbMinPalier:
   shadows every 2nd frame, no MSAA, one post pass off). Measured on the Odin: GPU 660 MHz / ~71% busy, the same
   as 60 Hz mode (unmodified 120 Hz: 1.1 GHz / 93%). Tuning keys for tests: pb-port-pr120, pb-port-minp120.
   Toggle: pill on the Home screen. */
(function () {
  var hz = 60;
  try { hz = window.AndroidPort ? AndroidPort.getHz() : 60; } catch (e) {}
  if (hz >= 90) {
    window.__pbMaxPR = parseFloat(localStorage.getItem('pb-port-pr120')) || 1.25;
    var mp = localStorage.getItem('pb-port-minp120');
    window.__pbMinPalier = mp === null ? 2 : +mp;
  }
  addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'portHz';
    b.innerHTML = '<span>' + (hz >= 90 ? '120' : '60') + ' Hz</span><small>' + (hz >= 90 ? 'smooth' : 'cool') + '</small>';
    b.title = 'Display refresh rate';
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      try { AndroidPort.setHz(hz >= 90 ? 60 : 120); } catch (err) {}
      setTimeout(function () { location.reload(); }, 250);
    });
    document.body.appendChild(b);
  });
})();
