# Changelog

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
