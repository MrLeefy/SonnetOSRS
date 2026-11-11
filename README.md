# Hollowmere Arena

A mobile-first 3D arena brawler with tick-based "read and react" combat: tap to move, tap a rival to fight,
swap stance to beat their armour and raise the right ward before their hit lands.

**Play:** open `dist/index.html` in any current mobile or desktop browser (needs WebGL). It is one self-contained
file - no install, no network. Works in portrait and landscape; add it to your home screen for a full-screen feel.

## How to play

| | Touch | Keyboard / mouse |
|---|---|---|
| Move | tap the ground | click |
| Attack | tap a fighter, or the crosshair button for the nearest | click / `Tab` |
| Camera | drag to orbit, pinch to zoom, twist to turn | drag, wheel, arrow keys |
| Stance (Blade / Bow / Staff) | right pad | `1` `2` `3` |
| Ward (vs Blade / Bow / Staff) | left pad | `Q` `W` `E` |
| Eat / Tonic / Special | buttons | `F` / `R` / `Space` |
| Pause | top right | `Esc` or `P` |

- **Stance** sets both your weapon and your armour. Blade beats Bow leathers, Bow beats Staff robes, Staff beats Blade plate.
- **Wards** remove 60% of one attack type, checked when the hit lands - so you can react to an arrow or spell in flight.
  They drain focus while raised. The icon over a rival's head shows what *they* are warding: hit them with something else.
- **Staff** hits root their target in place. Rooted fighters can still attack, so switch to Bow or Staff.
- **Specials** cost 50% energy: *Twin Fang* (two fast accurate strikes), *Deadeye* (never misses, mostly ignores wards),
  *Frostbind* (heavy blast that roots everything around the target).
- Kills heal you, refill special energy and drop golden loot (food, tonic, energy). Chain kills for a streak multiplier.
- Rivals come in four kinds - Brutes, Stalkers, Hexers and stance-switching Wardens - and get sharper as your streak grows.

## Development

```
npm install
npm run build        # bundles src/ into dist/index.html
npm run dev          # rebuild on change
node tools/simtest.mjs   # headless smoke test of the combat simulation
```

| File | What it does |
|---|---|
| `src/data.js` | all tuning numbers: styles, accuracy table, specials, difficulty |
| `src/world.js` | arena layout, collision grid, pathfinding, line of sight |
| `src/sim.js` | the 600 ms tick simulation (rendering-free, event driven) |
| `src/ai.js` | rival behaviour: targeting, wards, stance swaps, kiting, specials |
| `src/gfx/` | three.js scene, procedural low-poly fighters and animation, particles and projectiles |
| `src/ui.js`, `src/style.css`, `src/index.html` | touch HUD and menus |
| `src/input.js`, `src/audio.js`, `src/main.js` | gestures, procedural sound, main loop |

Graphics quality (Low / Medium / High) is in the pause menu and steps down automatically on slow devices.
All models, textures and sounds are generated in code; the only dependency is [three.js](https://threejs.org) (MIT), bundled into the build.
