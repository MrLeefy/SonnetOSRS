# QA report — Classic Client v0.3

## Executed locally

| Suite | Result | What it covers |
|---|---:|---|
| Syntax | Passed | All project JavaScript |
| Runtime | 65 passed | Existing deterministic inventory, combat, progression and save checks |
| Existing browser regression | 30 passed | Arena/Expedition gameplay, real rendered UI, touch and save reload |
| Classic interface | 19 passed | Composition, live controls, responsive geometry and classic dialogs |
| Total automated checks | **114 passed** | Actual engine and Chromium WebGL renderer |

These were executed on the isolated Oracle development worktree with Node 20 and Playwright 1.63.0. No production service was replaced. The full game is rendered; screenshots are not static mockup substitutions.

## New UI coverage

Eight gameplay/persistence source files are verified by their Git blob hashes to ensure the refactor did not silently rewrite mechanics. Slot hit regions roundtrip across ten sizes from a 320 px phone viewport to 1920×1080. Tests also exercise simulated notch/safe-area padding, clickable minimap pathfinding, compass reset, classic tabs, prayer toggling, spell selection, unequipping/wielding, native context menus, real chat filtering/wrapping/scrolling, collapsed chat, local report export, bank/journal dialogs, touch menu selection and rotation during an inventory press.

The previous 30 browser tests are preserved. Only their coordinate adapters and old-footer geometry lookups changed to point at the composed frame. The original 65 runtime regression tests are unchanged.

## Artifacts

The CI `game-and-qa` artifact contains `dist/index.html`, results and captured screens. Classic screenshots are `qa/classic-desktop.png`, `qa/classic-landscape.png`, `qa/classic-portrait.png`, `qa/classic-bank.png` and `qa/classic-journal.png`. Machine-readable results: `qa/browser-results.json` and `qa/classic-ui-results.json`.

## Important limitations

Chromium phone profiles and touch injection are emulation, not physical Android/iPhone tests. Safari/Firefox, actual GPU/handset variation, full accessibility and long-term balancing are not certified. The existing accelerated 1,200-tick Arena and 900-tick Expedition tests check state invariants, not real-time multiplayer capacity or a measured FPS improvement.

Networking, cloud saves, real social channels and online abuse reporting are not implemented. Report Abuse truthfully offers local report-file export. The existing context-loss path pauses and offers reload; transparent GPU restoration is not claimed. Local browser saves remain editable by the player.

Hosted GitHub Actions success must be checked separately for the actual commit; this report records local results rather than predicting a CI outcome.
