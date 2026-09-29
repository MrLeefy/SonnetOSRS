# QA report — OLDSKOOL v0.4

## Current verification layers

| Suite | Result | Scope |
|---|---:|---|
| Runtime regression | 65 passed | Inventory, equipment, combat edge cases, banking, Expedition, profiles, pathfinding/render invariants |
| Existing browser regression | 30 passed | WebGL boot, Arena/Expedition, saves, bank/crafting/contracts, mouse/touch/rotation/context loss |
| Classic interface | 19 passed | OSRS-inspired composition, responsive mappings, minimap, tabs, menus, chat, safe-area geometry |
| Rust unit tests | 5 passed | GE safe polygon, bank safety, PvP exterior, sanitization, collision/corner-step rules |
| Two-client online integration | 9 passed | Real Rust process + two real Chromium WebGL clients, safe-zone rejection, boundary crossing, PvP, illegal moves |
| Production deployment smoke | 2 passed | Vercel production → public Oracle WSS on desktop and emulated landscape phone |

The core local suites total **128 automated development checks** before the two production-origin smoke cases. The production smoke is deliberately listed separately because it exercises deployed infrastructure rather than the isolated test environment.

## Online integration details

`tests/online.cjs` starts a release-build Rust server on an isolated loopback port and temporary state file. It then launches two Chromium clients into the real generated WebGL client. It verifies that both players see each other, start inside the Grand Exchange safe zone, cannot bypass safety by directly crafting an attack packet, cross the visible GE ring into PvP, resolve a server-owned hit, return to safety, and cannot submit off-grid/wall-skipping movement.

The production smoke loads `https://oldskool-phi.vercel.app` rather than localhost and connects to `wss://oldskool-api.129.146.39.132.sslip.io/ws`. Both desktop and Pixel-7 landscape emulation joined World 1, crossed into PvP and returned to the safe zone without browser errors.

## Existing long-run checks retained

The browser regression still includes accelerated:

- 1,200 Arena ticks with fourteen bots plus the player/clerks;
- 900 Expedition ticks with enemy/node lifecycle checks.

These are accelerated state-invariant tests, not claims about real-time server capacity or measured device FPS.

## Important limits

- Pixel/phone tests are Chromium emulation, not a physical Android or iPhone.
- Safari and Firefox are not certified yet.
- Online inventory/equipment/prayer/item economy are still client-side in v0.4. Rust owns movement, PvP legality/damage/HP, online player state and basic profile persistence.
- There is no authenticated account system yet; reconnect tokens are local profile tokens, not secure account credentials.
- No large concurrent-player load test has been performed.
- The interface is OSRS/2009-era inspired original procedural art, not a claim of pixel-identical proprietary assets.
