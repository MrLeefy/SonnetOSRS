# Hollowmere

A mobile-first 3D adventure with tick-based "read and react" combat. Gear up in a safe town, bank your coins,
hunt the undead of the Barrow Yard, and risk what you carry against rival fighters in the Ashen Wilds.

**Play:** open `dist/index.html` in a current mobile or desktop browser (needs WebGL2). It is one self-contained
file - no install, no network. Portrait and landscape both work. Progress saves on the device.

## The island

| Area | What it is |
|---|---|
| **Hollowmere** (town) | Safe zone - nobody can fight here, and you slowly recover. Banker (vault), Smith (gear), Merchant (food and tonics). |
| **Barrow Yard** (west) | Undead: thralls, stalkers, hexers and the Barrow Warden boss. Best place to start earning coins. |
| **The Ashen Wilds** (north) | PvP ruins. Rival fighters hunt each other and you; better-geared rivals carry more and may drop gear. |
| Forest, mine, shore | Gathering: chop trees for logs, mine copper-coloured rocks for ore, fish the ripples off the shore. Trees and rocks deplete and grow back. |

Dying outside town drops the coins and supplies you were carrying (worn gear is kept) - bank first.

## Controls

| | Touch | Keyboard / mouse |
|---|---|---|
| Move / attack / talk | tap ground, foe or townsperson | click |
| Camera | drag to orbit, pinch to zoom, twist to turn | drag, wheel, arrow keys |
| Stance (Blade / Crossbow / Staff) | right pad | `1` `2` `3` |
| Ward (vs each attack type) | left pad | `Q` `W` `E` |
| Eat / Tonic / Special / Next target | buttons | `F` / `R` / `Space` / `Tab` |
| Bag and gear | bag button | `B` |

- **Stance** swaps weapon and armour. Blade beats Crossbow leathers, Crossbow beats Staff robes, Staff beats Blade plate.
- **Wards** remove 60% of one attack type, checked when the hit lands. They drain focus while raised.
- **Gear** comes in five tiers (Iron, Steel, Gilded, Ember, Voidglass) for each of three weapons and three armours.
- **Specials** cost 50% energy: Twin Fang, Deadeye, Frostbind.
- **Skills**: Woodcutting, Mining, Fishing and Cooking each level up with use (higher level = more successes). Tap a tree, rock,
  ripple or the campfire by the tavern. Logs and ore sell at the Market; cooked trout is free food.
- **Tasks** (bag button, Tasks tab) walk a new character through every activity and pay coins.

## Development

```
npm install
npm run build            # bundles src/ + assets/ into dist/index.html
node tools/simtest.mjs   # headless smoke test of the simulation
node tools/assets.mjs <dir with the KayKit pack repos>   # only when changing which models are used
```

| File | What it does |
|---|---|
| `src/world.js` | island layout, zones, collision grid, prop placement, pathfinding |
| `src/sim.js`, `src/ai.js` | 600 ms tick simulation: combat, zones, loot, bag, bank, shops; rival and monster behaviour |
| `src/items.js` | gear tiers, consumables, save format |
| `src/gfx/` | three.js scene, skeletal characters, resource nodes, effects, item icon renderer |
| `src/ui.js`, `src/style.css`, `src/index.html` | touch HUD, panels and menus |

## Credits

3D models and animations: KayKit packs by Kay Lousberg (www.kaylousberg.com), CC0 - see `assets/README.md`.
Rendering: [three.js](https://threejs.org) (MIT). Sounds are synthesised in code.
