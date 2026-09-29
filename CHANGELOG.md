# Changelog

## Unreleased — Server-owned ground items and PvP death piles

- Added `server/src/ground.rs`: Rust owns ground item spawn, quantity, owner, 60 s owner-only visibility, 3 min despawn, stacking, caps and pickup validation.
- New `drop` and `pickup` commands. Online Drop is available again and is intent-only; the browser waits for Rust's `account_state` and `ground_items`.
- Each connection is sent only the ground items it may see. Private items are never replicated to other players.
- PvP deaths: a real victim keeps their 3 most valuable items (4 with Protect Item); the rest drop as a pile owned by the killer. Simulated residents never lose or own loot.
- Ground items persist in the state file and keep their remaining timers across restarts. Rollback note: older servers cannot read the new state file.
- Online ground items are marked non-expiring on the client (game.js is untouched); only Rust despawns them.
- Tests: 17 new Rust tests and `tests/ground-online.cjs` (two real Chromium clients).

## 0.6.0 — World 1 residents, combat presentation and exact tile facing

- Online movement samples position and facing from the same authoritative tile segment; eight-direction turns happen at tile boundaries before translation.
- World 1 starts with 20 clearly identifiable simulated residents: ten social players inside the GE safe area and ten PvP residents outside.
- Simulated residents use normal player models and are marked as simulated in Examine/chat metadata rather than being presented as real humans.
- Server snapshots carry loadout, weapon, style, spell, overhead prayer, spec energy and combat level for online actors.
- Added ranged/magic attack ranges and line-of-sight pathing, weapon attack speeds, server-owned eating, protection-prayer reduction, ice freezes and weapon special state.
- Added attack-visual events so ranged bolts, magic projectiles, melee animations and special effects occur at attack timing instead of only showing a late hitsplat.
- Added crowd QA that boots the real Rust server with residents enabled and verifies the 10-safe/10-PvP split, unique residents, simulated chat, combat visuals, finite rendering and zero online movement errors.

## 0.5.2 — Tile-locked online locomotion

- Replaced the online renderer's catch-up interpolation with a queued sequence of exact server tile segments. Walk segments remain 600 ms; two-tile run ticks render as two 300 ms segments.
- Character facing is now derived from the exact segment currently being traversed and snapped to one of the eight tile directions at the segment boundary. The body can no longer lag behind its feet and visually moonwalk through a turn.
- A buffered packet never accelerates multiple old steps to catch up. If the visual buffer and authoritative route disagree, the client snaps to a legal tile boundary instead of inventing a diagonal correction.
- Walking/running gait is synchronized to tile progress. Each tile reaches the neutral footfall at its endpoint; a direction change happens at that footfall rather than in the middle of a stride.
- Running uses the same step sequence at double tile frequency with a slightly stronger stride while retaining the same server-owned 600 ms tick.
- Stationary combat facing remains independent: once movement ends, the actor turns toward its current target rather than retaining a stale travel direction.
- Added local and remote two-client regressions that verify instantaneous travel vectors and eight-direction facing through real multi-turn server routes.

## 0.5.1 — Mobile right-panel readability

- Give phone-landscape layouts a wider right-side panel while retaining the classic frame.
- Shorten the mobile minimap/chat footprint enough to raise the active panel scale instead of shrinking prayers, magic, equipment and skills.
- Increase mobile-landscape inventory item sprites, drag sprites and stack-count text.
- Keep desktop and portrait layout behavior unchanged.
- Add a browser regression that asserts the landscape panel/content scale and slot size stay readable.

## 0.5.0 — Movement and scene repair

- Replaced position submission with sequenced destination requests. Rust calculates the actual path and advances one walking or two running steps per tick. Repeating a destination is a safe no-op.
- Server motion includes intermediate corner tiles. Client rendering interpolates that path using monotonic time instead of fighting stale snapshots or the local game clock.
- Added latest-command-wins retargeting, stop/follow/pursuit, stale snapshot filtering, one-way resync, and message deduplication.
- The online world continues while a menu is open. Disconnect pauses input, retires ghost actors and resumes from a validated saved location.
- Unified PvP boundaries with rendered tile centres. Added world/collision version checks, duplicate active-profile rejection, serialized persistence and corruption-safe backup recovery. HP no longer resets simply by reconnecting.
- Protected offline saves when entering/leaving World 1; disabled importing/resetting offline profiles during online play.
- Rebuilt bank booths with open grilles, framed signs, counters, panels and hardware. Replaced the opaque blue slabs. Detailed the chest, building windows/doors and tower crown.
- Improved character silhouettes with tapered torso/limbs, shaped shields, faceted helmets, pointed wizard hats, cloak trim and closed weapon tips. Dropped coins/food/bones/potions/gear now have recognizable models.
- Removed the overlapping solid counter cap; foreground GE structures fade when they hide the player, without changing collision.
- Corrected ground picking over uneven terrain and kept the camera above terrain. Minimap clicks use the same interpolated centre as the map.
- Fixed the overlapping SAFE/PVP badge and stale clerk/world-map wording.
- Added 16 Rust movement/persistence regressions and 19 end-to-end route/reconnection/scene checks, including real server paths around every GE booth and buffered packet jitter.

## 0.4.0 — OLDSKOOL World 1

- Branded the playable client OLDSKOOL and added a classic brown/gold loading and world-selection experience.
- Added a persistent Rust/Axum backend on a 600 ms authoritative world tick.
- Added an actual Vercel-hosted Online World alongside preserved offline Arena and Expedition modes.
- Exported the procedural client collision grid and validate online movement against that exact map, including diagonal corner rules.
- Added server-issued resume tokens, reconnectable position/kill/death profiles and atomic persistence.
- Added two-client snapshots and real public online chat.
- Added a server-owned GE octagonal safe zone aligned to the visible stone ring: protected bank/GE interior and PvP outside.
- Client draws the authoritative boundary in the 3D scene and minimap, shows SAFE ZONE / PVP ZONE state, and hides Attack options while protected.
- Server independently rejects forged safe-zone attacks, illegal/off-grid movement and attack cooldown violations.
- Added strict WebSocket Origin policy for the deployed Vercel frontend.
- Oracle production process is loopback-only behind Caddy TLS and a hardened systemd service.
- Added tests/online.cjs for two-browser Rust integration plus deployment templates/documentation.
- Existing local gameplay remains available. Inventory/equipment/economy are not yet fully migrated into server authority; that is the next multiplayer phase.

## 0.3.0 — Classic client presentation

- Replaced the modern green header and mobile app shell with an integrated stone/bronze client matching the approved reference composition.
- Added original procedural frame textures and retro tab glyphs, parchment chat with live filtering/wrapping/scrolling, brown 4×7 inventory and a dynamic circular minimap with live stat orbs.
- Reused original game input actions through per-region and per-slot coordinate mapping; no gameplay engine or persistence rewrite.
- Preserved desktop mouse/keyboard and touch tap, hold, inventory drag, orbit and pinch. Rotation clears pending gestures without activating items.
- Kept classic visual identity in portrait and landscape, including browser-provided notch/safe-area support and collapsible chat.
- Restyled actual bank, journal, crafting, settings and NPC dialogs. Wrench opens settings/backups, bag utility opens banking, globe opens the real world map.
- Added honest local report export under Report Abuse; online social channels remain visibly offline.
- Fixed presentation-specific edge cases: duplicate context menus, old eight-line chat clamp, invisible scroll targets after collapsing chat, drag-ghost position and stale hover after resizing.
- Added 19 classic-interface browser checks alongside all 65 runtime and 30 existing browser checks. No physical-device or online multiplayer certification is claimed.

## 0.2.0 — Leefy Expedition foundation

### Playable additions
- Separate persistent Expedition and Arena profiles; no fake password login.
- Ten interactive expedition objects: three ore seams, three coppice trees, two fishing pools, a forge and a campfire.
- Gathering with tools, cancellation, depletion and timed recovery; four crafting/cooking recipes and six claim-once contracts.
- Three enemy archetypes across six spawns, including a procedural Stone Guardian with an avoidable, telegraphed ground slam and an enraged phase.
- Actual XP in seven combat and five gathering/production tracks; low-level frost/blood magic and craftable weapon upgrades.
- Real 120-entry bank with quantity withdrawal, potion-dose preservation, a small supply counter, and separate free Arena kits.
- Validated local saves, previous-save recovery, JSON export/import and scoped profile reset.

### Visuals and input
- Portrait/landscape touch layout with mapped inventory/equipment/prayer/combat panels; original desktop interface retained.
- Larger native touch action menus, chat and NPC dialogs, quick actions, and optional fullscreen.
- Frame-independent follow/zoom smoothing, sharper configurable render resolution, contextual rings, contact shadows, resource models, weapon detail, a unique guardian model and bounded particles.
- Cached CPU vertex buffers, grow-only dynamic GPU buffers and partial-buffer updates rather than allocating the entire upload buffer each frame.
- Per-mode journal, real skill values, waypoint markers, FPS option and reduced additional motion.

### Correctness
- Inventory insertion, removal, equipment displacement and banking are atomic. Full inventories cannot silently destroy a displaced two-handed weapon/shield.
- Stack overflow, non-integer/negative quantities, unknown IDs, invalid potion doses and stale item-menu references are rejected.
- Actor lifetime IDs prevent delayed hits damaging a respawned actor. Spawn protection is enforced during hit resolution and forfeited when attacking.
- Invalid movement steps, diagonal corner clipping, pathfinding stamp overflow, incompatible ammo and double-shot specials with one arrow are guarded.
- Touch cancellation cannot consume an item. A long-press release cannot retarget its synthetic click into the newly opened menu.
- Mode changes remove expedition objects and collision, hidden pages do not run unbounded catch-up, and lost graphics contexts offer a saved-state reload path.
- PvM defeats are counted separately from Arena kill streak records.

### Verification
- 65 deterministic runtime regression tests.
- 30 Chromium browser checks, including actual emulated touch/pinch injection and explicitly synthesized cancellation events.
- Accelerated 1,200-tick Arena and 900-tick Expedition invariant tests, not wall-clock multiplayer load tests.
- Deterministic source-to-standalone build and repository CI configuration.
