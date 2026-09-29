# OLDSKOOL online world

OLDSKOOL splits the game into a Vercel-hosted WebGL client and a persistent Rust authority on Oracle.

## Live endpoints

- Frontend: `https://oldskool-phi.vercel.app`
- Rust HTTPS health/world API: `https://oldskool-api.129.146.39.132.sslip.io`
- WebSocket: `wss://oldskool-api.129.146.39.132.sslip.io/ws`
- Rust service: `oldskool-server.service`
- Loopback bind: `127.0.0.1:8788`
- Tick: 600 ms

Port 8788 is intentionally not public. Caddy terminates TLS and proxies HTTP/WebSocket traffic.

## Authority boundary

The Rust server currently owns:

- connection/session identity and reconnect tokens;
- accepted player positions;
- the collision map exported from the actual WebGL world;
- diagonal/corner movement validation and short movement-rate limits;
- Grand Exchange safe-zone membership;
- PvP legality;
- PvP attack cooldown, damage, HP, deaths, kills and respawn;
- connected-player snapshots and public online chat;
- persisted online position/kill/death profile data.

Protocol 2 accepts sequenced destination requests, not reported positions. The server pathfinder advances one walking or two running tiles per 600 ms tick. Snapshots include the legal intermediate tiles; the renderer interpolates them without resetting routes to old snapshots. A modified client cannot enable PvP inside the GE because the Rust server independently rejects it.

Inventory, equipment, prayers, spells and most item economy actions are still the mature local SonnetOSRS systems. They have **not yet been migrated into the Rust authority**. Online World currently uses those local systems for presentation/loadout while the server owns the core PvP state above. Do not describe v0.4 as a fully authoritative MMO economy.

## Grand Exchange boundary

The visible inner GE ring in `world.js` has `RING_A = 8.5`. The server safe polygon is an octagon centered at `(48,48)` with apothem `9.0`, which covers the visible stone wall and bank booths.

Inside:
- `SAFE ZONE` badge;
- attacks on online players are hidden client-side;
- forged attack packets are rejected server-side.

Outside:
- `PVP ZONE` badge;
- boundary line changes to red;
- online player attack option is enabled;
- Rust resolves damage.

The same octagon is drawn in the 3D world and minimap from the safe-zone definition sent by the server.

## Ground items and death piles

Rust owns the ground-item lifecycle (`server/src/ground.rs`). The browser sends only `drop { index }` and `pickup { uid }` intentions and displays the `ground_items` list its connection is allowed to see.

- **Ownership/visibility:** an item is visible and pickable only by its owner for 100 ticks (60 s), then becomes public. Other players are never sent private items.
- **Despawn:** 300 ticks (3 min) total. Timers are stored as ticks remaining, so they survive a restart.
- **Stacking:** stackables merge for the same item, tile and owner and keep the older timers. Potion doses are preserved through drop and pickup.
- **Limits:** 512 items world-wide and 100 per owner for ordinary drops. Death piles bypass these caps so an item is never destroyed by a cap.
- **Pickup:** validated for visibility, range (Chebyshev distance 1, to tolerate one tick of client lag) and inventory space; the ground item is removed only if the inventory accepted it.
- **PvP death:** a real victim keeps their 3 most valuable items (4 with Protect Item; a stack counts as one item and is kept whole). Everything else becomes a pile at the death tile owned by the killer. Simulated residents never lose items and never own loot, so residents cannot be farmed. A resident killer leaves a public pile.
- **Sync:** ground state is persisted in the state file (`ground_items`, `next_ground_uid`). An older server can no longer read a state file written by this version because `PersistedState` denies unknown fields; back up before deploying and keep the backup if you may roll back.

## Persistence

The systemd service writes online profiles to `/var/lib/oldskool/profiles.json` via serialized atomic temp-file replacement with a previous-valid-file backup. The file contains resume token → name, last accepted position, HP, kills and deaths. Local browser profile/save data continues to use the existing versioned local save system.

## Service deployment

The installed binary and collision data live at:

```text
/opt/oldskool/oldskool-server
/opt/oldskool/world_collision.json
```

The committed templates are in `deploy/`. The production systemd unit uses hardening, a memory ceiling and a loopback-only bind. Caddy provides the public TLS endpoint.

Useful commands:

```sh
sudo systemctl status oldskool-server
sudo journalctl -u oldskool-server -f
curl https://oldskool-api.129.146.39.132.sslip.io/health
curl https://oldskool-api.129.146.39.132.sslip.io/world
```

## Verification

`tests/online.cjs` starts an isolated Rust process, launches two real Chromium WebGL clients, joins both to one world, forges a safe-zone attack, crosses both players outside the GE ring, resolves server PvP, returns to safety, and sends invalid movement directly to the backend.

The production smoke additionally loads the real Vercel site and connects it to the public Oracle WSS endpoint on desktop and an emulated landscape phone. Browser phone testing is still emulation rather than a physical device.

## Next authority migrations

1. Equipment/loadout state.
2. Food/potion/prayer/special state.
3. Melee/ranged/magic formulas and projectile timing.
4. Trade and shops (ground items and banking are now server-owned).
5. Account authentication and cloud persistence.
6. Anti-abuse/rate policy backed by authenticated account identity.
