# Deepmere

A mobile-first voxel sandbox: dig, mine, blast and rebuild a whole island. Open `index.html` in any modern
browser (needs WebGL 2). One self-contained file, no install; progress saves on the device.

## Play
- **Drag** anywhere to walk · **tap a block** to dig it (or build on it) · **hold** to keep digging where you point
- **USE** digs or builds straight ahead, **JUMP** jumps (and fires the jetpack once you own one)
- **Two fingers** turn the camera and pinch to zoom; the round arrow button turns it 45°
- Keyboard: WASD, Space, mouse, Q/E turn, 1-3 tools, 4-6 build slots, G dynamite, R ration, H Sky Hammer, F interact, B bag

## What's in it
- Pick, shovel (scoops soft ground), energy drill, dynamite, and the Sky Hammer that charges as you dig
- A drivable Bore Rig that chews 3-block tunnels
- Ore veins, caves, lava, buried chests, falling sand and gravel, water that floods what you dig below sea level
- Camp with a Merchant (sell ore, buy supplies) and a Smith (picks, drill, energy cells, jetpack)
- Automatic cutaway so you can always see yourself underground

Source is in `src/`; `python3 tools/build.py` bundles it into `index.html`.
