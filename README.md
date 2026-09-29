# Grand Exchange PvP (2007-style) — playable replica

Open `dist/index.html` in any modern browser (Chrome / Edge / Firefox / Safari; needs WebGL). No install, no network.

## Controls
- **Left-click** ground: walk (yellow X) · left-click a player: attack (red X) · **right-click**: RuneScape-style context menu
- **Arrow keys** / **middle-mouse drag**: rotate & tilt camera · mouse wheel: zoom · click the compass: face north
- **F1–F7** switch side panels (Combat, Skills, Player Killing, Inventory, Worn Equipment, Prayer, Magic) · F8-F12 the bottom row
- Type to chat, **Enter** to send (`::bots 8`, `::restock`, `::heal`, `::run`) · **Space** continues dialogue
- Inventory: click = default action (Wield / Eat / Drink), drag to rearrange, right-click for Use / Drop / Examine
- Bank booths restock your gear (Hybrid, Melee, Ranged, Magic); the Grand Exchange clerks will talk to you

## Combat (600ms game ticks)
Weapon speeds, accuracy/max-hit formulas, protection prayers (40% PvP reduction), specials (Dragon dagger p++,
Granite maul instant spec, AGS, Dragon scimitar "Sever", Magic shortbow), Ancient Ice/Blood spells with freezes,
skulls, run energy, food/potion delays, loot drops. Opponents are AI "pkers": melee mains, zerkers, pures,
rangers, mages and hybrids that flick prayers, eat, kite, freeze and use specials.

Source is in `src/`, `tools/build.py` bundles it, `tools/makefont.py` regenerates the bitmap fonts.
