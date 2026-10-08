# Grand Exchange PvP (2007-style) — playable replica

Open `dist/index.html` in any modern browser (Chrome / Edge / Firefox / Safari; needs WebGL). No install, no network.

## Controls
- **Left-click** ground: walk (yellow X) · left-click a player: attack (red X) · **right-click**: RuneScape-style context menu
- **Arrow keys** / **middle-mouse drag**: rotate & tilt camera · mouse wheel: zoom · click the compass: face north
- **F1–F7** switch side panels (Combat, Skills, Player Killing, Inventory, Worn Equipment, Prayer, Magic) · F8-F12 the bottom row
- Type to chat, **Enter** to send (`::bots 8`, `::restock`, `::heal`, `::run`) · **Space** continues dialogue
- Inventory: click = default action (Wield / Eat / Drink), drag to rearrange, right-click for Use / Drop / Examine
  The next free slot is outlined; hovering a slot shows the total of that item you carry (stacks and potion doses)
- Hovering the 3D view shows a box with the name under the pointer: a player or bot with combat level and hitpoints, a bank booth, or a loot pile
- Bank booths restock your gear (Hybrid, Melee, Ranged, Magic); the Grand Exchange clerks will talk to you
- Options tab: Brightness, Run, **Sound**, **Splats** (hitsplat numbers), **Stamps** (`[hh:mm]` on chat lines), **Flash** (red wash on damage), Sharp scaling, Opponents count. Toggles are remembered in this browser only
- Minimap: white = you and bots, red = a bot attacking you, yellow = clerks, grey = bodies, orange = bank booths, cyan = Grand Exchange, red dots = loot

## Touch (phones and tablets)
- **Tap** = left-click (walk, attack, use a panel button) · **hold** about half a second = right-click menu
- **Drag** in the 3D view rotates the camera · **pinch** zooms · drag over the side panels to move items
- Tap the chat box (or the login name field) to open the on-screen keyboard; **Enter** sends
- Play in landscape: on a portrait phone a notice asks you to turn the phone (you can dismiss it)

## Combat (600ms game ticks)
Weapon speeds, accuracy/max-hit formulas, protection prayers (40% PvP reduction), specials (Dragon dagger p++,
Granite maul instant spec, AGS, Dragon scimitar "Sever", Magic shortbow), Ancient Ice/Blood spells with freezes,
skulls, run energy, food/potion delays, loot drops. Opponents are AI "pkers": melee mains, zerkers, pures,
rangers, mages and hybrids that flick prayers, eat, kite, freeze and use specials.

A kill feed at the top-right of the 3D view lists kills and special attacks for six seconds; kills involving you
also go to chat, and being defeated is announced there. Taking damage washes the view red briefly.
Gear and food in the item table: black dragonhide full helm and kiteshield (below rune), lobster (heals 12) and
monkfish (heals 16). Shark (heals 20) remains the strongest food.

Source is in `src/`, `tools/build.py` bundles it, `tools/makefont.py` regenerates the bitmap fonts.
