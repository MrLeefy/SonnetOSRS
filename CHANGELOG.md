# Changelog

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
