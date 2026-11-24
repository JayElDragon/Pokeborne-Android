# Pokeborne Android port

Offline Android wrapper for [Pokeborne](https://play.pokeborne.fun/), the 3D souls-like Pokémon web game.
The game runs in a full-screen WebView and every file is served from the APK, so it plays without internet.
It was made for and tested on the AYN Odin 3 (built-in controller + touch screen).

This repository holds **only the port code**. The game itself (code, models, audio, art) belongs to its authors,
and Pokémon belongs to Nintendo, Game Freak and The Pokémon Company. It is not included here.

## What the port does

- **Offline:** no INTERNET permission. The game's own "native app" path is enabled (`window.Capacitor`), which skips
  the service worker, the online update check and Google sign-in. Online-only features (leaderboards, PvP Gauntlet,
  telemetry) fail quietly. Progress is kept on the device.
- **No account, just a trainer name:** the Guest / Sign in screens are replaced by a trainer-name field on first
  launch (3–16 characters). The name shows in the Home top bar; the ✎ button changes it. Sign-in prompts on other
  screens are hidden.
- **On-screen controls:** the game's own touch pad shows up as soon as a run starts (not only after the first touch),
  with a visible resting stick. Readable button labels (ATK, HEAVY, ROLL, GUARD, EXEC.).
  Using the physical controller hides them, touching the screen brings them back.
- **Touch layout editor:** pause a run → **Touch layout** (bottom left): drag any button, change size (70–150%)
  and opacity (30–100%), Reset, Done. Saved on the device.
- **Smoother stick:** 15% dead zone, full speed at 92% of the travel with an eased curve, sprint only at the edge
  (the original reached full speed at 55%).
- **60 / 120 Hz:** 60 Hz by default (at 120 Hz the unmodified game kept the GPU at 1.1 GHz / 93% and the fan loud).
  A pill on the Home screen switches to 120 Hz, which caps the render resolution at 1.25x and the quality tier at 2,
  measured at the same GPU load as 60 Hz.
- Back button = Escape, phone warning and telemetry popup pre-answered, scrollbars hidden.

## Build

Needs Python 3 with Pillow, JDK 17 and the Android SDK (build-tools 36.0.0, platform android-35).
Paths are at the top of `build_pokeborne.py` (`ANDROID_SDK_ROOT` / `JAVA_HOME_17` override them).

1. Put the game mirror in `src/` so that `src/site/index.html` exists (the `pokeborne-main-web` package:
   `site/`, `mirror.py`). `python src/mirror.py update` refreshes it to the current online build.
2. `python build_pokeborne.py` → `Pokeborne.apk`.
   The first build creates a signing key in `android/` (`pokeborne.keystore` + `keystore.properties`); keep it,
   or later builds cannot update the installed app.

Game files are never edited on disk: the few patches (stick curve, ATK label, resolution / quality caps, account screens → trainer name) are applied
to the minified chunks at build time and each one checks its anchor, so a new game build fails loudly instead of
breaking silently.

## Layout

| Path | What |
|---|---|
| `build_pokeborne.py` | builds and signs the APK, applies the build-time patches |
| `android/` | manifest and `MainActivity.java` (WebView, asset server, 60/120 Hz bridge) |
| `port/android_port.js` | runs first on every page: native flag, popups, touch pad, refresh option, layout editor, trainer name |
| `port/android_port.css` | stick ghost, button labels, Hz pill, layout editor, no scrollbars |

Port by JayElDragon.
