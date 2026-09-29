# SonnetOSRS · Leefy expansion

An attributable fork of [OminousIndustries/SonnetOSRS](https://github.com/OminousIndustries/SonnetOSRS), keeping its compact procedural WebGL renderer, 600 ms combat simulation and classic interface. This branch adds a playable **offline Expedition** beside the original **Arena** sandbox. It is not the official RuneScape client, an OSRS account service or an online multiplayer server.

## Play

Run `python3 -m http.server 8000` from the repository and open `http://localhost:8000/`. Select **Arena** or **Expedition**, enter a local profile name and play. No password is requested. The rebuilt `dist/index.html` is also a self-contained game with embedded assets; serving it over localhost/HTTPS gives local saving a predictable browser origin.

Arena supplies max-level practice kits and AI opponents. Expedition starts at a safe camp with a trail blade, gathering tools and food. Mine western ore seams, chop the northern coppice and catch fish in the eastern pools. Cook fish at the campfire, forge better blades, bank supplies, complete six contracts, then fight bandits, raiders and the Stone Guardian. Journal destinations place a world marker. The guardian marks its slam before impact: move out of the ring.

### Controls

Desktop: left click to act, right click for options, middle-mouse drag or arrow keys to orbit, wheel to zoom, F1–F7 for the classic panels. Touch: tap to act, drag the world to orbit, pinch to zoom, long-press for a large action menu. Inventory drag rearranges slots. The touch footer gives direct access to panels, food, potions, running, special attacks and chat. Both portrait and landscape layouts use the same underlying gameplay actions and inventory.

The top bar opens Journal, Bank, Save and Menu. Bank requires being beside a bank booth and out of combat; the Bank button can walk you there. Menus pause this **offline** simulation. Escape closes a menu. Fullscreen depends on browser support.

### Saves

Profiles are stored locally in the browser, separately for Arena and Expedition. Autosave runs approximately every 15 active seconds and when the page is hidden/closed. Menu includes JSON backup export/import. Export before clearing browser data, moving to another host/device, or resetting a profile. There is no cloud sync and no guarantee browsers will retain storage indefinitely.

A previous validated save is retained as a backup. Invalid imports are rejected before modifying the character. If both saved copies are corrupt, they are preserved and autosave is blocked until you import a valid backup or explicitly reset that profile. Blocking or filling browser storage does not crash gameplay, but progress cannot be retained without exporting.

Expedition death currently returns the player to camp with carried equipment retained. This is an intentional forgiving rule, not OSRS death-system parity. Free kits and sandbox healing commands are not available in Expedition. Progression and balance are original to this fork.

## Build and test

Runtime has no downloaded JavaScript packages or third-party asset requests. Python 3.9+ builds the standalone HTML. Node 20+ is used for development checks; Playwright is a development-only dependency.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`tools/build.py` fails if a required module is missing. It deterministically rebuilds `dist/index.html`, `index.html`, and `dev.html`. Edit source modules, not the generated HTML. `npm run verify` runs the full local sequence after Chromium is installed. Linux CI may need `npx playwright install --with-deps chromium` for system dependencies.

## Architecture

The upstream global-script engine remains intact. `engine_ext.js` is an explicit compatibility layer capturing original functions and replacing the inventory, actor-lifetime and command boundaries. `expedition.js` defines items, resources, recipes, contracts, enemies, banking and progression. `profiles.js` owns whitelisted save validation. `client.js` presents the classic logical panels in a responsive shell. `controls.js` owns the pointer gesture state machine. `polish.js` handles renderer buffer reuse, resolution, camera easing, effects and added models. `main.js` owns lifecycle and bounded fixed-step scheduling.

This is an incremental extension of the existing code, not a replacement engine or a claim of a measured 100× performance gain. The compatibility layer is deliberately centralized; future work should migrate old globals into explicit interfaces rather than layering more independent overrides.

## QA and limits

See [QA report](docs/QA.md), [changelog](CHANGELOG.md), and [roadmap](EXPANSION_PLAN.md). The current suite includes 65 runtime regression checks and 30 Chromium end-to-end checks. Browser tests include genuine emulated touch/pinch events and synthetic cancellation cases. They are **not physical Android/iPhone tests**. No Firefox/Safari, multiplayer, Android APK or production hosting has been certified in this pass.

## Attribution and rights

Original project: **OminousIndustries/SonnetOSRS**. Original renderer, world, UI assets and combat foundations are preserved. Leefy expansion work is maintained in this fork. No new blanket license is granted over the upstream work by this README. RuneScape-related names remain references to their respective owners; this project is unofficial and does not request account credentials.
