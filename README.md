# SonnetOSRS · Classic Client v0.3

An attributable fork of [OminousIndustries/SonnetOSRS](https://github.com/OminousIndustries/SonnetOSRS), preserving the compact procedural WebGL renderer, 600 ms combat simulation and offline Arena / Expedition gameplay.

The v0.3 presentation refactor replaces the green app-style shell with an integrated, original **2009scape / OSRS-inspired classic interface**: stone and bronze trim, a circular minimap, live stat orbs, retro panel glyphs, a dark brown 28-slot inventory, parchment chat and channel buttons. Both desktop and mobile use the same visual identity. No mockup is used as a screen background; the map, inventory, messages and buttons show actual game state.

## Play

Run `python3 -m http.server 8000` from the repository and open `http://localhost:8000/`. Choose **Arena** or **Expedition** and enter a local profile name. No RuneScape account or password is requested. `dist/index.html` is the complete standalone build with embedded assets. Serving it over localhost or HTTPS gives local saving a predictable browser origin.

**Arena** retains the free combat-kit PvP practice sandbox with AI opponents. **Expedition** starts at a safe camp with a trail blade, tools and food. Mine ore, gather timber, catch and cook fish, forge better blades, bank supplies, complete six contracts and challenge the Stone Guardian. The existing gameplay, combat, economy, save format and gesture state machine were not rewritten for this UI pass.

## Classic interface controls

The tabs below the minimap open combat, stats, journal, inventory, equipment, prayer and magic. Lower stone tabs retain the social, logout, settings, emote and music panels. The **wrench** opens settings, save/export/import and fullscreen controls. The **bag utility beside the minimap** walks to a bank booth or opens banking when already nearby and out of combat. The **globe** opens a map derived from the current world.

Desktop: left click to act, right click for a context menu, middle-mouse drag or arrow keys to orbit, wheel to zoom, F1–F7 for the original panels. Touch: tap to act, drag the world to orbit, pinch to zoom, hold for a large `Choose Option` menu. Drag inventory slots to rearrange. The minimap is clickable. The heart orb eats available food; other orbs control quick prayers, running and special attacks.

The parchment chat supports wrapping, scrolling, filters and native text entry. Tap its input row to type on a phone. In portrait, classic-styled quick buttons provide food, potion, run, special, save, chat, fullscreen and settings access. Chat can be collapsed in settings to give the world more room. Layout respects browser-provided safe-area insets.

Private/clan/trade channels are not connected to a multiplayer service and display `Off`. The Report Abuse button explicitly offers a **local bug-report export**, not an online report to Jagex or another player. This remains an offline game.

## Saves

Arena and Expedition use separate local profiles. Autosave, previous-valid-save recovery and JSON backup import/export are retained. The UI change does not reset existing progress or change save keys. Keep using the same origin and profile name to retain browser saves; export before moving hosts/devices or clearing browser data. There is no cloud sync.

Expedition death intentionally returns the player to camp with carried equipment retained. Free combat kits and sandbox healing remain limited to Arena. Damaged saves and storage failures are handled without pretending progress was saved successfully.

## Build and verify

Python 3.9+ builds the standalone HTML. Node 20+ and Playwright are development-only tools; runtime does not fetch JavaScript packages, sprites or fonts.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run verify
```

For Linux CI system dependencies, use `npx playwright install --with-deps chromium`. The build requires all 22 ordered modules and creates deterministic `dist/index.html`, `index.html` and `dev.html`. Edit source modules, not generated HTML.

The suite consists of **65 runtime regressions**, the **30 existing browser checks**, and **19 new classic-UI checks**. The original browser assertions remain; their coordinate helpers were adapted to the composed presentation. The new suite verifies eight gameplay/persistence files by Git blob hash, slot mappings at ten viewport sizes, safe-area layout, real minimap movement, prayer/spell/equipment actions, context menus, chat scrolling, rotation during touch and local report export.

## Code structure

`classic.js` owns original procedural textures, glyphs and pure layout rectangles. `client.js` owns the actual composed frame, coordinate mappings and themed native dialogs. `classic_presenter.js` adapts the existing logical canvas and render resolution without changing game state rules. The existing `controls.js` gesture machine, `profiles.js` persistence and gameplay modules remain unchanged.

See [classic implementation notes](docs/CLASSIC_UI.md), [QA](docs/QA.md), [changelog](CHANGELOG.md) and [roadmap](EXPANSION_PLAN.md).

## Scope and attribution

This is an unofficial inspired interface, not a claim of pixel-identical proprietary artwork, a complete RuneScape recreation, online multiplayer or a measured speed multiplier. Browser tests emulate phones; physical Android/iPhone, Safari/Firefox and a full accessibility audit remain outstanding. Rust/networking/PvP-boundary work is separate from this presentation-only release.

Original project and engine foundations: **OminousIndustries/SonnetOSRS**. Original attribution is retained. Added interface textures and glyphs are procedural original art; no blanket license over upstream code is asserted by this README.
