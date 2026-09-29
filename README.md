# OLDSKOOL

**OLDSKOOL** is the multiplayer evolution of the SonnetOSRS WebGL project. It keeps the compact procedural renderer, 600 ms combat feel, classic 2009-era interface and existing offline gameplay, while adding a real persistent Rust world for Grand Exchange PvP.

**Play:** https://oldskool-phi.vercel.app

**Server health:** https://oldskool-api.129.146.39.132.sslip.io/health

## What is live

The frontend runs on Vercel. The authoritative online service runs continuously on Oracle behind Caddy/TLS.

```text
Vercel WebGL client
        |
      WSS
        |
Caddy / TLS on Oracle
        |
127.0.0.1:8788
        |
Rust / Axum OLDSKOOL server
```

Choose **World 1 · Online PvP** to join multiplayer. The Grand Exchange interior is a server-enforced safe zone. Cross the visible stone ring and the client changes to `PVP ZONE`; other online players become attackable there. Walk back through the ring and the server protects you again.

The old **Arena** bot sandbox and **Expedition** progression mode remain playable offline.

## Classic frontend

The interface is original procedural art inspired by the classic 2009scape / OSRS client composition rather than a screenshot shell:

- large WebGL viewport on the left;
- parchment chat and classic channel row;
- circular live minimap;
- HP/prayer/run/special orbs;
- two rows of stone tab glyphs;
- dark brown 4×7 inventory;
- equipment, prayer, magic and combat panels using the existing gameplay handlers;
- classic `Choose Option` mouse/touch menus;
- top-left contextual action text;
- desktop, phone landscape and portrait layouts with safe-area support;
- OLDSKOOL brown/gold loading/world-selection screen;
- live GE safe/PvP boundary in both world and minimap.

No external UI screenshot or proprietary sprite sheet is used as the running interface.

## Online authority

The Rust server currently owns accepted movement, the real collision map, GE zone membership, online PvP legality, attack cooldown/damage/HP, deaths/kills/respawn, online player snapshots, public chat and basic persistent online profiles.

The client sends a destination. Rust finds and steps the legal route; the browser smoothly renders the server-provided intermediate tiles. No client position correction loop is used. Sending a handcrafted Attack message from inside the GE is still rejected by Rust.

The mature SonnetOSRS inventory/equipment/prayer/item systems remain client-side for this release and are the next systems to migrate. See `docs/ONLINE.md` for the exact trust boundary.

## Local development

```sh
npm ci --ignore-scripts
python3 tools/build.py
cargo test --manifest-path server/Cargo.toml
cargo build --release --manifest-path server/Cargo.toml
npx playwright install chromium
npm run test:browser
npm run test:online
```

`dist/index.html` is the self-contained Vercel client. `server/` contains the Rust authority and exported collision data.

## Current verification

The project retains:

- 65 deterministic runtime regression checks;
- 30 general Chromium browser checks;
- 19 dedicated classic-interface checks;
- 21 Rust movement/server/persistence unit tests;
- 9 two-client online integration checks;
- 17 route, jitter, reconnection, save-isolation and scene checks.

Production is additionally smoke-tested from the deployed Vercel origin to the public Oracle `wss://` endpoint on desktop and an emulated landscape phone. Emulated phone tests are not a substitute for physical Android/iPhone testing.

## Deployment

Vercel project: `oldskool`

Oracle service: `oldskool-server.service`

Public backend hostname: `oldskool-api.129.146.39.132.sslip.io`

The Rust socket itself is bound only to `127.0.0.1:8788`. Caddy owns the public TLS/WebSocket boundary.

Deployment templates are in `deploy/`.

## Attribution and scope

This remains an unofficial project built from the attributable `OminousIndustries/SonnetOSRS` foundation. RuneScape/OSRS names are descriptive references to the visual/gameplay era; OLDSKOOL is not the official RuneScape client and does not request RuneScape credentials.

The project does not claim pixel-identical proprietary artwork or full OSRS feature parity. Online inventory/economy authority, authenticated accounts, trading and broader MMO persistence remain future work.

## Latest repair

See `docs/REPAIR.md` for the movement-protocol change, scene improvements, migration and test scope. Refresh an already-open pre-0.5 tab after deployment to use protocol 2. Saved online names, positions, kills and deaths are retained; invalid stored positions recover at the safe spawn.
