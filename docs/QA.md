# OLDSKOOL v0.5 QA

The verification commands use the real procedural renderer and Rust server, not a static screenshot or fake server implementation.

| Suite | Checks |
|---|---:|
| Existing runtime regressions | 65 |
| Rust movement/server/persistence | 21 |
| General browser regression | 30 |
| Classic interface | 19 |
| Two-client online integration | 9 |
| Route/reconnection/scene repair | 17 |
| **Total** | **161** |

The local repair suite passed all 17 scenarios, including multi-turn routes around the Grand Exchange, legal intermediate steps, idempotent destinations, no reject-resend flood, stale snapshots, variable buffering of real incoming packets, menu-open movement, reconnect, duplicate token rejection and online/offline save isolation. The 21 Rust tests passed as well. Hosted CI status is checked separately before deployment; a table of expected counts is not a claim that an unobserved CI run passed.

Screenshots produced by `tests/repair.cjs` are in the `game-and-qa` CI artifact: `repair-desktop.png`, `repair-portrait.png`, `repair-landscape.png` and `repair-bank.png`. They contain test characters, not production account data. `repair-results.json` records the new scenario results.

The original 1,200-tick Arena and 900-tick Expedition accelerated invariants remain. These are not real-time concurrent-user or device-FPS benchmarks. Physical Android/iPhone, Safari/Firefox, full accessibility, online item/economy authority and long-term balancing are not certified by this pass. See `REPAIR.md` for scope and the exact movement fixes.
