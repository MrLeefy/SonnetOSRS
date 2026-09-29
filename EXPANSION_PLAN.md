# Leefy expansion plan

This branch keeps the original single-page, dependency-light client intact while adding foundations for a larger game.

## Phase 1 — foundation
- Pointer/touch input for modern Android/iOS browsers.
- Mobile landscape HUD pass: larger hit targets, pinch zoom, camera gesture, long-press context menu.
- Versioned local save profiles and settings.
- Deterministic smoke tests for combat/pathing/world generation.
- Performance/debug overlay and low/medium/high graphics presets.
- Split hard-coded data from engine logic so content can grow without turning core files into monoliths.

## Phase 2 — gameplay
- Expand melee/ranged/magic gear, special attacks, spellbooks, prayers and consumables.
- PvM NPC framework, aggression/leashing, drop tables and respawn regions.
- Real bank storage, equipment presets and loadout editor.
- Skill XP/levels with skilling nodes and gathering loops.
- Loot keys, kill/death statistics, streaks and configurable PvP rules.

## Phase 3 — world
- Chunked/region-based world definition instead of one hard-coded 96x96 scene.
- Multiple connected areas, interiors and instanced arenas.
- Region streaming/culling so world size can grow without rendering everything.
- Collision/line-of-sight data generated from region content.

## Phase 4 — multiplayer
- Server-authoritative 600 ms tick simulation.
- WebSocket transport with interpolation between authoritative snapshots.
- Persistent accounts/characters, inventories, banks and stats.
- Anti-cheat validation for movement, combat timing and item actions.
- Private/local server mode kept available for offline play.

## Phase 5 — polish
- Installable PWA/mobile shell.
- Accessibility and remappable controls.
- Replay/spectator mode.
- Bot difficulty presets and richer tactical AI.
- Automated release builds.
